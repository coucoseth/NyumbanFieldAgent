import { Model, Query } from '@nozbe/watermelondb';
import { text, relation, children } from '@nozbe/watermelondb/decorators';
import type { Relation } from '@nozbe/watermelondb';
import InspectionDraft from './InspectionDraft';
import LocalPhoto from './LocalPhoto';

export default class DraftRoom extends Model {
  static table = 'draft_rooms';
  static associations = {
    inspection_drafts: { type: 'belongs_to', key: 'draft_id' },
    local_photos: { type: 'has_many', foreignKey: 'draft_room_id' },
  } as const;

  @text('draft_id') draftId!: string;
  @text('room_id') roomId!: string;
  @text('condition') condition!: string;
  @text('notes') notes?: string;

  @relation('inspection_drafts', 'draft_id') inspectionDraft!: Relation<InspectionDraft>;
  @children('local_photos') localPhotos!: Query<LocalPhoto>;
}
