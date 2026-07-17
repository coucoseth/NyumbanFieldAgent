import { Model } from '@nozbe/watermelondb';
import { text, field, relation } from '@nozbe/watermelondb/decorators';
import type { Relation } from '@nozbe/watermelondb';
import Property from './Property';

export default class Room extends Model {
  static table = 'rooms';
  static associations = {
    properties: { type: 'belongs_to', key: 'property_id' },
  } as const;

  @text('property_id') propertyId!: string;
  @text('label') label!: string;
  @field('floor') floor!: number;

  @relation('properties', 'property_id') property!: Relation<Property>;
}
