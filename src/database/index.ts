import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from './schema';
import Property from './models/Property';
import Room from './models/Room';
import InspectionDraft from './models/InspectionDraft';
import DraftRoom from './models/DraftRoom';
import LocalPhoto from './models/LocalPhoto';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'nyumban_db',
  jsi: true,
  onSetUpError: error => {
    console.error('Failed to set up SQLite database:', error);
  }
});

export const database = new Database({
  adapter,
  modelClasses: [
    Property,
    Room,
    InspectionDraft,
    DraftRoom,
    LocalPhoto,
  ],
});
