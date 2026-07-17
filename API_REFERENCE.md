# Nyumban Field API — Reference

This is the formal reference: every endpoint, every field, every status code, with exact request/response schemas. If you want the narrative version — *why* the API behaves the way it does, and the warts explained in plain English — read [`API.md`](API.md) first. This document assumes you already have.

**Base URL:** `https://nyumban-assessment-0000d50c027d.herokuapp.com`

**Content type:** `application/json` for all request/response bodies, except `POST /photos` (`multipart/form-data`) and `GET /photos/:id` (raw bytes).

---

## 1. Authentication

Every request carries **two independent credentials**. Neither substitutes for the other.

| Header | Applies to | Purpose |
|---|---|---|
| `X-Assessment-Key` | **Every** endpoint in this document, no exceptions | Identifies you as a candidate. Issued to you once; do not share it. |
| `Authorization: Bearer <access_token>` | Every endpoint **except** `POST /auth/login` and `POST /auth/refresh` | The session token your app is responsible for acquiring, refreshing, and re-acquiring. This is the credential under test. |

| Missing / invalid | Result |
|---|---|
| `X-Assessment-Key` missing or unrecognized | `401` on any endpoint |
| `Authorization` missing, malformed, or expired | `401` on any endpoint that requires it |

There is no API key query parameter, no cookie-based session, and no OAuth flow. Two headers, always.

---

## 2. Conventions

### 2.1 Casing

Response body key casing is **inconsistent by resource**, not by accident:

| Resource | Casing |
|---|---|
| `/properties` (list and detail) | `snake_case` |
| `/inspections` (all methods) | `camelCase` |
| `/auth/*` | Mixed — see [§4.1](#41-post-authlogin) for the exact shape |

### 2.2 Timestamps

| Location | Format |
|---|---|
| `/properties` → `last_inspected_at` | ISO 8601 string (e.g. `"2026-05-02T09:14:00Z"`), or `null` |
| `/inspections` → `created` | Unix epoch, **seconds** |
| `/inspections` → `updated_at` | Unix epoch, **milliseconds** |
| `/inspections` request body → `completedAt` | Unix epoch, **seconds** (client-supplied) |

### 2.3 Pagination

`GET /properties` and `GET /inspections` share one cursor scheme:

| Field | Location | Type | Notes |
|---|---|---|---|
| `limit` | query param | integer | Default 25. Max 50 — values above 50 are **silently clamped**, never rejected. |
| `cursor` | query param | opaque string | Omit on the first page. Pass back the previous response's `next_cursor` verbatim. |
| `next_cursor` | response body | opaque string \| `null` | `null` means you're on the last page. |

Cursors are opaque — do not parse or construct them. There is no offset/page-number scheme and no way to fetch the whole collection in one call.

### 2.4 Idempotency

`POST /inspections` accepts an optional `Idempotency-Key` header (any string you generate, typically a UUID).

- Send the same key twice → the second call returns the **exact stored response** from the first (same status, same body); no second record is created.
- Keys are scoped per-candidate and honored for **24 hours**.
- Omit the header and the endpoint is a plain, non-idempotent POST: two calls, two records.

### 2.5 Optimistic concurrency

Every property carries a `version` integer. `POST /inspections` requires you to echo the version you last read back as `propertyVersion`. If it no longer matches the server's current value — because you, or another agent, already wrote against that property — the request is rejected with `409` and the response body is the **current property record**, so you can reconcile without a second round trip. See [§6.1](#61-post-inspections).

---

## 3. Errors

Every error response is JSON. The shape depends on the status code:

| Status | Body shape | Meaning |
|---|---|---|
| `401` | `{ "error": string }` | Missing/unknown `X-Assessment-Key`, or missing/invalid/expired bearer token, or a spent refresh token was reused |
| `404` | `{ "error": string }` | Resource doesn't exist, or doesn't exist **for your tenant** — the two are indistinguishable by design |
| `409` | The current resource record (endpoint-specific shape, not a generic error envelope) | Optimistic-concurrency conflict |
| `413` | `{ "error": string }` | Request body / uploaded file exceeds the size limit |
| `422` | `{ "errors": { "<field>": "<message>" } }` — note the **plural** key and the nested object | Validation failure. One or more field-level messages. |
| `429` | `{ "error": string }` + `Retry-After` header (seconds) | Rate limited |
| `500` | `{ "error": "internal server error" }` | Something went wrong. Retrying is the correct response — this happens by design on this environment; see §5. |
| `503` | `{ "error": "service unavailable" }` | `POST /photos` only, elevated failure rate by design; see §5 |
| `507` | `{ "error": string }` | `POST /photos` only, per-account storage cap reached |

`422` is the only status with a nested-object body; every other error status is a flat `{ "error": "..." }`, and `409` is the odd one out entirely (see above). Do not write a single generic error parser that assumes one shape for all four-hundreds — it will not survive contact with `409` or `422`.

---

## 4. Rate limits & reliability

| Behavior | Value |
|---|---|
| Rate limit | 20 requests / 10 seconds, scoped to your assessment key. Exceeding it returns `429` with a `Retry-After` header stating exactly how many seconds to wait. |
| Random failure rate | Approximately 8% of requests to any endpoint **except `/auth/*`** return `500`, unconditionally of anything you did right. |
| Photo upload failure rate | `POST /photos` additionally fails with `503` roughly 15% of the time — on top of, not instead of, the 8% above. |
| Latency | Roughly log-normal. Typical (p50) response ~300ms; the slow tail (p95) reaches ~1.8s. This is not a fixed delay — expect variance on every call. |

None of the above is documented per-endpoint below; it applies uniformly except where noted.

---

## 5. Auth

### 5.1 `POST /auth/login`

Exchanges credentials for a token pair. Requires `X-Assessment-Key` only — no bearer token (you don't have one yet).

**Request body**

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `password` | string | yes |

```json
{ "email": "agent@nyumban.test", "password": "Kireka2026!" }
```

**Response — `200`**

```json
{
  "access_token": "eyJhbGciOi...",
  "refreshToken": "9f3a1c2b...",
  "expires_in": 900,
  "agent": {
    "id": "agt_874b7973e5c1e073",
    "display_name": "Nyumban Field Agent",
    "assignedRegion": "central"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `access_token` | string (JWT) | Send as `Authorization: Bearer <access_token>` on every subsequent call |
| `refreshToken` | string | Opaque, single-use — see §5.2 |
| `expires_in` | number | Always exactly `900` (seconds). No grace period after expiry. |
| `agent.id` | string | Use as the `agentId` query param on `GET /inspections` |
| `agent.assignedRegion` | string | Informational only; not enforced server-side |

**Errors**

| Status | Condition |
|---|---|
| `401` | Wrong email/password |

---

### 5.2 `POST /auth/refresh`

Exchanges a refresh token for a new access + refresh pair. Requires `X-Assessment-Key` only.

**Request body**

| Field | Type | Required |
|---|---|---|
| `refreshToken` | string | yes |

**Response — `200`**

Identical shape to `POST /auth/login`. The `refreshToken` in this response is a **new** token — the one you sent is now spent.

**Behavior you must design around**

- Refresh tokens are **single-use and rotating**. A successful call invalidates the token you just sent and issues a new one.
- Reusing a token that has already been rotated (or has expired) returns `401` **and revokes the entire session** — every access token and every refresh token tied to that login, not just the one you reused. There is no recovery short of `POST /auth/login` again.
- Refresh tokens are valid for 30 days from issuance (irrelevant to this task's timescale, stated for completeness).

**Errors**

| Status | Condition |
|---|---|
| `401` | Token unknown, already spent, or expired — session is revoked as a side effect in the spent/expired case |

---

## 6. Properties

### 6.1 `GET /properties`

**Query parameters**

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `cursor` | string | no | — | Opaque; from a previous response's `next_cursor` |
| `limit` | integer | no | 25 | Clamped to 50 |
| `q` | string | no | — | Case-insensitive substring match against `name` and `address` |
| `region` | string | no | — | Exact match: `central` \| `eastern` \| `western` \| `northern` |
| `status` | string | no | — | Exact match: `active` \| `inactive` \| `under_renovation` |

`q`, `region`, and `status` combine with logical AND. An unrecognized `region`/`status` value is not an error — it returns a page with zero results.

**Response — `200`**

```json
{
  "data": [
    {
      "id": "prp_0000",
      "name": "Kireka Heights Block C",
      "address": "Plot 14, Kireka",
      "unit_count": 40,
      "region": "central",
      "last_inspected_at": "2026-05-02T09:14:00Z",
      "status": "active",
      "version": 7
    }
  ],
  "next_cursor": "eyJvcmQiOjB9"
}
```

**Property object (list form)**

| Field | Type | Notes |
|---|---|---|
| `id` | string | Prefixed `prp_` |
| `name` | string | |
| `address` | string \| `null` | Null on ~3% of records — a real, viewable state, not an error |
| `unit_count` | integer \| `null` | Null on ~3% of records, independently of `address` |
| `region` | string | One of the four values above |
| `last_inspected_at` | string (ISO 8601) \| `null` | `null` = never inspected |
| `status` | string | One of `active` / `inactive` / `under_renovation` |
| `version` | integer | Round-trip this into `propertyVersion` on `POST /inspections` |

**Errors:** standard set (§3) — `401`, `429`, `500`.

---

### 6.2 `GET /properties/:id`

**Path parameters**

| Param | Type |
|---|---|
| `id` | string, e.g. `prp_0000` |

**Response — `200`**

Same object as the list form, **plus**:

| Field | Type | Notes |
|---|---|---|
| `rooms` | array of `{ id, label, floor }` | `id`: string; `label`: string (e.g. `"Bedroom 1"`); `floor`: integer |

```json
{
  "id": "prp_0000",
  "name": "Kireka Heights Block C",
  "address": "Plot 14, Kireka",
  "unit_count": 40,
  "region": "central",
  "last_inspected_at": "2026-05-02T09:14:00Z",
  "status": "active",
  "version": 7,
  "rooms": [
    { "id": "rm_0000_0", "label": "Living Room", "floor": 0 },
    { "id": "rm_0000_1", "label": "Bedroom 1", "floor": 0 }
  ]
}
```

**Errors**

| Status | Condition |
|---|---|
| `404` | No property with this `id` exists |

Plus the standard set (§3).

---

## 7. Inspections

### 7.1 `POST /inspections`

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `propertyId` | string | yes | |
| `propertyVersion` | integer | yes | The `version` you last read for this property |
| `type` | string | no | Free-form; defaults to `"routine"` server-side if omitted |
| `rooms` | array | yes (may be empty) | See shape below |
| `completedAt` | integer | yes | Unix seconds |

Each entry in `rooms`:

| Field | Type | Notes |
|---|---|---|
| `roomId` | string | Not validated against the property's actual room list |
| `condition` | string | Free-form |
| `notes` | string | Free-form |
| `photoIds` | array of string | Every id **must** already exist via `POST /photos`, or the whole request is rejected — see below |

```json
{
  "propertyId": "prp_0000",
  "propertyVersion": 7,
  "type": "routine",
  "rooms": [
    { "roomId": "rm_0000_0", "condition": "good", "notes": "No issues.", "photoIds": ["pht_a1b2c3"] }
  ],
  "completedAt": 1752345600
}
```

**Request headers**

| Header | Required | Notes |
|---|---|---|
| `Idempotency-Key` | no | See §2.4 |

**Response — `201`**

```json
{ "id": "insp_9f3a1c2b4d5e6f70", "created": 1752345600, "updated_at": 1752345600123 }
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Prefixed `insp_`. Keep it — there is no reverse lookup by any other key. |
| `created` | integer | Unix **seconds** — echoes the `completedAt` you sent |
| `updated_at` | integer | Unix **milliseconds** — server-assigned write time |

**Errors**

| Status | Body | Condition |
|---|---|---|
| `409` | The **current property record** — same full shape as `GET /properties/:id`, including `rooms` | `propertyVersion` no longer matches the server's value |
| `422` | `{ "errors": { "<field>": "<message>" } }` | Missing/invalid required field, unknown `propertyId`, or an unknown `photoId` anywhere in `rooms[].photoIds` |
| `429` | standard | Rate limited |
| `500` | standard | See §5 |

Plus `401` (§3).

---

### 7.2 `GET /inspections`

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `agentId` | string | no | Filter to one agent's inspections; value is `agent.id` from login |
| `cursor` | string | no | See §2.3 |
| `limit` | integer | no | See §2.3 |

**Response — `200`**

```json
{
  "data": [
    {
      "id": "insp_9f3a1c2b4d5e6f70",
      "propertyId": "prp_0000",
      "type": "routine",
      "rooms": [ { "roomId": "rm_0000_0", "condition": "good", "notes": "No issues.", "photoIds": ["pht_a1b2c3"] } ],
      "completedAt": 1752345600,
      "created": 1752345600,
      "updated_at": 1752345600123
    }
  ],
  "next_cursor": null
}
```

Object shape is identical to the `POST` response plus the full request payload echoed back (`propertyId`, `type`, `rooms`, `completedAt`).

**Errors:** standard set (§3).

---

### 7.3 `GET /inspections/:id`

**Path parameters**

| Param | Type |
|---|---|
| `id` | string, e.g. `insp_9f3a1c2b4d5e6f70` |

**Response — `200`**

Same object shape as one item in §7.2's `data` array.

**Errors**

| Status | Condition |
|---|---|
| `404` | No inspection with this `id` exists **for your tenant** (it may exist for someone else's — you'll still get `404`, not `403`) |

Plus the standard set (§3).

---

## 8. Photos

### 8.1 `POST /photos`

`multipart/form-data`, not JSON.

**Request**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | binary (form field name must be exactly `file`) | yes | Max 5MB |

**Response — `201`**

```json
{ "id": "pht_a1b2c3d4e5f60718", "url": "/photos/pht_a1b2c3d4e5f60718" }
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Prefixed `pht_`. Reference this in `POST /inspections` → `rooms[].photoIds` |
| `url` | string | A relative path, not an absolute URL — see [§8.2](#82-get-photosid) for how to actually fetch it |

**Errors**

| Status | Condition |
|---|---|
| `413` | File exceeds 5MB |
| `503` | Elevated random failure rate specific to this endpoint (§4) — on top of the general 8% |
| `507` | This account has reached its photo storage cap (~200 photos). Not chaos — a real, permanent ceiling for this quota. |

Plus `401`, `429`, `500` (§3).

---

### 8.2 `GET /photos/:id`

**Path parameters**

| Param | Type |
|---|---|
| `id` | string, e.g. `pht_a1b2c3d4e5f60718` |

**Response — `200`**

Raw image bytes. `Content-Type` is set to whatever MIME type was recorded at upload time.

This endpoint requires **both** auth headers, identically to every other endpoint in this document. A bare `<Image source={{ uri }}>` will not attach them — you'll need to pass a `headers` object on the image source, or fetch the bytes yourself (e.g. via `fetch`) and hand the component a local/blob URI instead. This is a client-side networking detail, not a server limitation.

**Errors**

| Status | Condition |
|---|---|
| `404` | No photo with this `id` exists for your tenant |

Plus the standard set (§3).

---

## 9. Endpoint summary

| Method | Path | Auth | Success | Notable errors |
|---|---|---|---|---|
| `POST` | `/auth/login` | key only | `200` | `401` |
| `POST` | `/auth/refresh` | key only | `200` | `401` (kills session on reuse) |
| `GET` | `/properties` | key + bearer | `200` | — |
| `GET` | `/properties/:id` | key + bearer | `200` | `404` |
| `POST` | `/inspections` | key + bearer | `201` | `409`, `422` |
| `GET` | `/inspections` | key + bearer | `200` | — |
| `GET` | `/inspections/:id` | key + bearer | `200` | `404` |
| `POST` | `/photos` | key + bearer | `201` | `413`, `503`, `507` |
| `GET` | `/photos/:id` | key + bearer | `200` (binary) | `404` |

`401`, `429`, and `500` apply to every row above and are omitted from the table for brevity.
