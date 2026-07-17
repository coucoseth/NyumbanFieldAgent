import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import Property from '../../database/models/Property';
import Room from '../../database/models/Room';
import InspectionDraft from '../../database/models/InspectionDraft';
import DraftRoom from '../../database/models/DraftRoom';
import LocalPhoto from '../../database/models/LocalPhoto';
import { api } from '../api';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Robust exponential backoff helper
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const status = error.response?.status;
    // Retry on transient 500, 503 errors, or network timeouts/offline errors (no status code)
    if (retries > 0 && (!status || status === 500 || status === 503)) {
      await delay(delayMs);
      return retryWithBackoff(fn, retries - 1, delayMs * 2);
    }
    throw error;
  }
}

class SyncQueueManager {
  private isSyncing = false;

  public async processQueue(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 1. Find draft records where sync_status === 'pending_sync'
      const draftsCollection = database.get<InspectionDraft>('inspection_drafts');
      const pendingDrafts = await draftsCollection
        .query(Q.where('sync_status', 'pending_sync'))
        .fetch();

      for (const draft of pendingDrafts) {
        try {
          // 2. Fetch related rooms and local photos
          const draftRooms: DraftRoom[] = await database
            .get<DraftRoom>('draft_rooms')
            .query(Q.where('draft_id', draft.id))
            .fetch();

          let hasQuotaLimitError = false;

          // 3. Process and upload photos for each room
          for (const room of draftRooms) {
            const photos: LocalPhoto[] = await database
              .get<LocalPhoto>('local_photos')
              .query(Q.where('draft_room_id', room.id))
              .fetch();

            for (const photo of photos) {
              if (photo.syncStatus === 'pending') {
                // Compress and scale image placeholder (ensure it is under 5MB)
                // In a production app, this would call a native module resizing function if needed.
                // We will build the multipart/form-data request
                const formData = new FormData();
                formData.append('file', {
                  uri: photo.localUri,
                  name: `photo_${photo.id}.jpg`,
                  type: 'image/jpeg',
                } as any);

                try {
                  // Call POST /photos with backoff
                  const uploadResponse = await retryWithBackoff(() =>
                    api.post('/photos', formData, {
                      headers: {
                        'Content-Type': 'multipart/form-data',
                      },
                    })
                  );

                  const serverPhotoId = uploadResponse.data.id;

                  // Save server_photo_id in SQLite and mark photo sync_status = 'synced'
                  await database.write(async () => {
                    await photo.update(record => {
                      record.serverPhotoId = serverPhotoId;
                      record.syncStatus = 'synced';
                    });
                  });
                } catch (uploadError: any) {
                  const status = uploadError.response?.status;
                  // Handle 507 quota limit: stop upload and mark draft status as failed
                  if (status === 507) {
                    hasQuotaLimitError = true;
                    break;
                  }
                  // For other errors, throw to let the draft sync fail
                  throw uploadError;
                }
              }
            }

            if (hasQuotaLimitError) {
              break;
            }
          }

          // If we hit a quota limit, mark the draft as failed and terminate the loop
          if (hasQuotaLimitError) {
            await database.write(async () => {
              await draft.update(record => {
                record.syncStatus = 'failed';
                record.errorMessage = 'Quota limit reached (507)';
              });
            });
            continue;
          }

          // 4. Build the final inspection JSON payload in camelCase
          const roomsPayload = [];
          for (const room of draftRooms) {
            const photos: LocalPhoto[] = await database
              .get<LocalPhoto>('local_photos')
              .query(Q.where('draft_room_id', room.id))
              .fetch();

            const photoIds = photos
              .map(p => p.serverPhotoId)
              .filter((id): id is string => !!id);

            roomsPayload.push({
              roomId: room.roomId,
              condition: room.condition,
              notes: room.notes || '',
              photoIds: photoIds,
            });
          }

          const payload = {
            propertyId: draft.propertyId,
            propertyVersion: draft.propertyVersion,
            type: draft.type,
            rooms: roomsPayload,
            completedAt: draft.completedAt,
          };

          // 5. Send POST /inspections
          try {
            await retryWithBackoff(() =>
              api.post('/inspections', payload, {
                headers: {
                  'Idempotency-Key': draft.id,
                },
              })
            );

            // If success (201): Update SQLite draft status to 'synced'
            await database.write(async () => {
              await draft.update(record => {
                record.syncStatus = 'synced';
                record.errorMessage = undefined;
              });
            });

            // Clean up/delete local photo references or files if desired
            // (Files could be cleaned up here via a RN filesystem module if required)
          } catch (inspectError: any) {
            const status = inspectError.response?.status;

            if (status === 409) {
              // 409 Stale version: Mark local draft as 'conflict_detected'
              await database.write(async () => {
                await draft.update(record => {
                  record.syncStatus = 'conflict_detected';
                  record.errorMessage = 'Concurrency conflict (409)';
                });
              });

              // Write the returned current property body (snake_case) to the local database
              const propertyData = inspectError.response.data;
              if (propertyData) {
                const propertyCollection = database.get<Property>('properties');
                const roomCollection = database.get<Room>('rooms');

                let localProperty: Property | null = null;
                try {
                  localProperty = await propertyCollection.find(propertyData.id);
                } catch {
                  // Property not found locally
                }

                await database.write(async () => {
                  if (localProperty) {
                    await localProperty.update(record => {
                      record.name = propertyData.name;
                      record.address = propertyData.address;
                      record.unitCount = propertyData.unit_count;
                      record.region = propertyData.region;
                      record.lastInspectedAt = propertyData.last_inspected_at;
                      record.status = propertyData.status;
                      record.version = propertyData.version;
                    });
                  } else {
                    localProperty = await propertyCollection.create(record => {
                      record._raw.id = propertyData.id;
                      record.name = propertyData.name;
                      record.address = propertyData.address;
                      record.unitCount = propertyData.unit_count;
                      record.region = propertyData.region;
                      record.lastInspectedAt = propertyData.last_inspected_at;
                      record.status = propertyData.status;
                      record.version = propertyData.version;
                    });
                  }

                  // Update rooms under property
                  if (propertyData.rooms && Array.isArray(propertyData.rooms)) {
                    const existingRooms = await roomCollection
                      .query(Q.where('property_id', localProperty.id))
                      .fetch();
                    for (const r of existingRooms) {
                      await r.destroyPermanently();
                    }
                    for (const roomData of propertyData.rooms) {
                      await roomCollection.create(record => {
                        record._raw.id = roomData.id;
                        record.propertyId = localProperty.id;
                        record.label = roomData.label;
                        record.floor = roomData.floor;
                      });
                    }
                  }
                });
              }

              // Disregard the error and break the loop to trigger the Reconciliation UI on next check
              break;
            } else {
              // If transient error (500 or timeout) or other validation errors (422)
              await database.write(async () => {
                await draft.update(record => {
                  record.syncStatus = 'failed';
                  record.errorMessage = inspectError.message || 'Inspection post failed';
                });
              });
            }
          }
        } catch (singleDraftError: any) {
          // If a single draft fails, update its status to failed and proceed to the next
          await database.write(async () => {
            await draft.update(record => {
              record.syncStatus = 'failed';
              record.errorMessage = singleDraftError.message || 'Sync failed';
            });
          });
        }
      }
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncQueueManager = new SyncQueueManager();
export default syncQueueManager;
