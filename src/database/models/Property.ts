import { Model, Query } from '@nozbe/watermelondb';
import { field, text, children } from '@nozbe/watermelondb/decorators';
import Room from './Room';

export default class Property extends Model {
  static table = 'properties';
  static associations = {
    rooms: { type: 'has_many', foreignKey: 'property_id' },
  } as const;

  @text('name') name!: string;
  @text('address') address?: string;
  @field('unit_count') unitCount?: number;
  @text('region') region!: string;
  @text('last_inspected_at') lastInspectedAt?: string;
  @text('status') status!: string;
  @field('version') version!: number;

  @children('rooms') rooms!: Query<Room>;
}
