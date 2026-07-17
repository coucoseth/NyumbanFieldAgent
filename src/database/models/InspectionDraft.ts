import { Model, Query } from '@nozbe/watermelondb';
import { text, field, children } from '@nozbe/watermelondb/decorators';
import DraftRoom from './DraftRoom';

export default class InspectionDraft extends Model {
  static table = 'inspection_drafts';
  static associations = {
    draft_rooms: { type: 'has_many', foreignKey: 'draft_id' },
  } as const;

  @text('property_id') propertyId!: string;
  @field('property_version') propertyVersion!: number;
  @text('type') type!: string;
  @field('completed_at') completedAt!: number;
  @text('sync_status') syncStatus!: string;
  @text('error_message') errorMessage?: string;

  @children('draft_rooms') draftRooms!: Query<DraftRoom>;
}
