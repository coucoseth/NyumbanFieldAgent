import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'properties',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'unit_count', type: 'number', isOptional: true },
        { name: 'region', type: 'string', isIndexed: true },
        { name: 'last_inspected_at', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'version', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'rooms',
      columns: [
        { name: 'property_id', type: 'string', isIndexed: true },
        { name: 'label', type: 'string' },
        { name: 'floor', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'inspection_drafts',
      columns: [
        { name: 'property_id', type: 'string', isIndexed: true },
        { name: 'property_version', type: 'number' },
        { name: 'type', type: 'string' },
        { name: 'completed_at', type: 'number' },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'error_message', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'draft_rooms',
      columns: [
        { name: 'draft_id', type: 'string', isIndexed: true },
        { name: 'room_id', type: 'string' },
        { name: 'condition', type: 'string' },
        { name: 'notes', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'local_photos',
      columns: [
        { name: 'draft_room_id', type: 'string', isIndexed: true },
        { name: 'local_uri', type: 'string' },
        { name: 'server_photo_id', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string', isIndexed: true },
      ],
    }),
  ],
});
