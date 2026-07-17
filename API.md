# Nyumban Field API — v1 (and some of v2)

**Base URL:** `https://nyumban-assessment-0000d50c027d.herokuapp.com`

**Auth header (required on every request, all endpoints below):** `X-Assessment-Key: <the key you were issued>`

**Test credentials (same for every candidate):** `agent@nyumban.test` / `Kireka2026!`

---

## Notes before you start

This API is used in production. Some of the following is intentional, some is historical. All of it is real. It is documented here so that nothing surprises you at 2am — but we are not going to change it for you.

- Responses are **not consistently cased.** `/properties` returns `snake_case`. `/inspections` returns `camelCase`. `/auth` returns both, for the same values.
- Fields documented as required are **occasionally null.** Roughly 3% of property records have a null `address` or a missing `unit_count`. These are real records; they must still be viewable.
- The API returns **HTTP 500 approximately 8% of the time**, at random, on any endpoint except `/auth/*`. It is not your bug. It is ours. Retrying usually works.
- The API rate-limits at **20 requests per 10 seconds**, returning `429` with a `Retry-After` header (in seconds). It means it.
- `p95` latency is around **1.8 seconds**. It is not fast and it will not become fast.
- Timestamps are ISO 8601, except in `/inspections`, where `created` is a Unix epoch **in seconds** and `updated_at` is an epoch **in milliseconds**.
- **Every endpoint below requires `X-Assessment-Key`.** A missing or unknown key gets `401` on anything. This is separate from the bearer token below.

---

## Endpoint index

So there's no ambiguity about what exists:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Get an access + refresh token pair |
| `POST` | `/auth/refresh` | Rotate a refresh token for a new pair |
| `GET` | `/properties` | Search, filter, paginate the portfolio |
| `GET` | `/properties/:id` | Property detail + rooms |
| `POST` | `/inspections` | Submit a completed inspection |
| `GET` | `/inspections` | List an agent's submitted inspections |
| `GET` | `/inspections/:id` | Fetch one inspection by id |
| `POST` | `/photos` | Upload inspection evidence |
| `GET` | `/photos/:id` | Retrieve a previously uploaded photo |

That's the whole surface, and it is everything you need for the task. There is no endpoint for property assignment, no logout endpoint, and no bulk/export endpoint — none of those are part of the job.

---

## Auth

### `POST /auth/login`
```json
{ "email": "...", "password": "..." }
```
→ `200`
```json
{
  "access_token": "...",
  "refreshToken": "...",
  "expires_in": 900,
  "agent": { "id": "agt_...", "display_name": "...", "assignedRegion": "central" }
}
```

- Access tokens expire in **15 minutes**. There is no grace period.
- `POST /auth/refresh` with `{ "refreshToken": "..." }` returns a new pair. **The old refresh token is immediately invalidated** (rotation).
- Using an invalidated refresh token returns `401` and **kills the session server-side** — every token on that session dies, not just the one you reused. You will need to log in again.
- Refresh tokens live 30 days.

---

## Properties

### `GET /properties?cursor=<c>&limit=<n>&q=<search>&region=<r>&status=<s>`

Cursor-paginated. `limit` max 50; values above 50 are silently clamped to 50, not rejected.

→ `200`
```json
{
  "data": [
    {
      "id": "prp_8f21",
      "name": "Kireka Heights Block C",
      "address": "Plot 14, Kireka",
      "unit_count": 40,
      "region": "central",
      "last_inspected_at": "2026-05-02T09:14:00Z",
      "status": "active",
      "version": 7
    }
  ],
  "next_cursor": "eyJpZCI6..."
}
```

- The portfolio is **~5,000 properties.** There is no endpoint that returns them all.
- `q` searches name and address. It is server-side, case-insensitive, and slow.
- `region` is an exact match: one of `central`, `eastern`, `western`, `northern`.
- `status` is an exact match: one of `active`, `inactive`, `under_renovation`.
- `q`, `region`, and `status` combine (AND). An unknown `region`/`status` value doesn't error — it just returns an empty page.
- **There is no `updated_since` parameter.** We know. It is on the roadmap and has been for two years.

### `GET /properties/:id`
Returns the above, plus `rooms: [{ "id", "label", "floor" }]`.

- Property `version` is the field you must round-trip into `POST /inspections`. It changes every time anyone successfully submits an inspection against that property — including another agent.

---

## Inspections

### `POST /inspections`
```json
{
  "propertyId": "prp_8f21",
  "propertyVersion": 7,
  "type": "routine",
  "rooms": [
    { "roomId": "rm_1", "condition": "good", "notes": "...", "photoIds": ["pht_..."] }
  ],
  "completedAt": 1752345600
}
```

→ `201` `{ "id": "insp_...", "created": 1752345600, "updated_at": 1752345600123 }`

**Failure modes you must handle:**

| Code | Meaning |
|---|---|
| `409` | `propertyVersion` is stale — the property changed since you read it (possibly by another agent). Body contains the current server record — re-read it, don't guess. |
| `422` | Validation, or an unknown `photoId` (see Photos below). Body: `{ "errors": { "<field>": "<message>" } }` |
| `429` | Rate limited. Respect `Retry-After`. |
| `500` | Random. Retry. |

- The endpoint is **not idempotent by default.** If you POST twice, you get two inspections. If you want de-duplication, send an `Idempotency-Key` header; we will honour it for 24 hours.

### `GET /inspections?agentId=<id>`
Returns this agent's inspections (server's, not yours locally). Paginated, same cursor scheme.

- `agentId` is the `agent.id` from your login response.
- This is your reconciliation tool: after a crash, a reinstall, or just being unsure, this is how you find out what the server actually has, independent of whatever your local queue believes.

### `GET /inspections/:id`
Returns one inspection, same shape as the list items. `404` if it doesn't exist.

- Useful for verifying a specific record you hold the id for, without paging through the list. If a submission failed *ambiguously* (connection died before you read the response, so you never got an id), this endpoint can't help you — retry the POST with the same `Idempotency-Key`, or reconcile against `GET /inspections?agentId=`.

---

## Photos

### `POST /photos` — `multipart/form-data`, field name `file`

→ `201` `{ "id": "pht_...", "url": "..." }`

- Max **5MB** per file. Larger returns `413`.
- Uploads are **slow** and fail more often than other endpoints. Assume ~15% failure rate on a bad connection.
- A photo must exist on the server **before** it can be referenced in a `POST /inspections` body. An inspection referencing an unknown `photoId` is rejected with `422`. This means your sync order matters: upload photos first, then submit the inspection that references them.
- There is a **per-account storage cap of ~200 photos.** Past that, uploads get `507`. This is a real ceiling, not a chaos-injected one — plan your evidence capture accordingly (you almost certainly don't need to keep every raw photo queued forever once its inspection has synced).

### `GET /photos/:id`
Returns the raw image bytes with the correct `Content-Type`.

- This endpoint requires the same `X-Assessment-Key` + bearer auth as everything else. A plain `<Image source={{ uri }}>` won't send those headers on its own — you'll need to either pass a `headers` object on the image source, or fetch the bytes yourself and hand the component a local/blob URI. This is a normal mobile-networking problem, not a missing feature.

---

## Support

`it@nyumbanapp.com`. We respond quickly.
