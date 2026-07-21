import { MMKV } from 'react-native-mmkv';

class MemoryStorage {
  private store: Map<string, string> = new Map();

  getString(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clearAll(): void {
    this.store.clear();
  }
}

interface StorageInterface {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

let storageInstance: StorageInterface;

try {
  storageInstance = new MMKV({
    id: 'nyumban-storage',
  });
} catch (error) {
  console.warn(
    'MMKV initialization failed (JSI disabled or remote debugger active). Falling back to memory storage:',
    error
  );
  storageInstance = new MemoryStorage();
}

export const storage = storageInstance;

export const getAccessToken = (): string | undefined => {
  try {
    return storage.getString('access_token');
  } catch {
    return undefined;
  }
};

export const setAccessToken = (token: string): void => {
  try {
    storage.set('access_token', token);
  } catch (err) {
    console.error('Failed to set access token:', err);
  }
};

export const getRefreshToken = (): string | undefined => {
  try {
    return storage.getString('refresh_token');
  } catch {
    return undefined;
  }
};

export const setRefreshToken = (token: string): void => {
  try {
    storage.set('refresh_token', token);
  } catch (err) {
    console.error('Failed to set refresh token:', err);
  }
};

export const clearTokens = (): void => {
  try {
    storage.delete('access_token');
    storage.delete('refresh_token');
  } catch (err) {
    console.error('Failed to clear tokens:', err);
  }
};
