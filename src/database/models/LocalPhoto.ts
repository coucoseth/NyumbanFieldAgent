import { Model } from '@nozbe/watermelondb';
import { text, relation } from '@nozbe/watermelondb/decorators';
import type { Relation } from '@nozbe/watermelondb';
import DraftRoom from './DraftRoom';

export default class LocalPhoto extends Model {
  static table = 'local_photos';
  static associations = {
    draft_rooms: { type: 'belongs_to', key: 'draft_room_id' },
  } as const;

  @text('draft_room_id') draftRoomId!: string;
  @text('local_uri') localUri!: string;
  @text('server_photo_id') serverPhotoId?: string;
  @text('sync_status') syncStatus!: string;

  @relation('draft_rooms', 'draft_room_id') draftRoom!: Relation<DraftRoom>;
}
