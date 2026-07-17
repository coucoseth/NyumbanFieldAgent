import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({
  id: 'nyumban-storage',
});

export const getAccessToken = (): string | undefined => {
  return storage.getString('access_token');
};

export const setAccessToken = (token: string): void => {
  storage.set('access_token', token);
};

export const getRefreshToken = (): string | undefined => {
  return storage.getString('refresh_token');
};

export const setRefreshToken = (token: string): void => {
  storage.set('refresh_token', token);
};

export const clearTokens = (): void => {
  storage.delete('access_token');
  storage.delete('refresh_token');
};
