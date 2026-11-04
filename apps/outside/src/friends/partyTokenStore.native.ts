import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createMigratingTokenStorage, type TokenStore } from './tokenStorage';

// AFTER_FIRST_UNLOCK rather than the default WHEN_UNLOCKED. Party sharing never runs in
// the background (no background Health reads or tasks; it stops when the app leaves the
// foreground), but Convex Auth refreshes its one-hour JWT on a timer, and the server
// rotates the refresh token before the client saves the new one. A refresh in the
// seconds after the phone locks would then fail to save under WHEN_UNLOCKED, leaving only
// a used refresh token. Not THIS_DEVICE_ONLY: SDK 58 deprecates that variant, and an
// encrypted backup moves the login with the game save, as AsyncStorage did.
// https://docs.expo.dev/versions/v58.0.0/sdk/securestore/#securestoreafter_first_unlock
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export function createPartyTokenStore(): TokenStore {
  return createMigratingTokenStorage(
    {
      getItem: (key) => SecureStore.getItemAsync(key, options),
      setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
      removeItem: (key) => SecureStore.deleteItemAsync(key, options),
    },
    {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
      removeItem: (key) => AsyncStorage.removeItem(key),
      getAllKeys: () => AsyncStorage.getAllKeys(),
    },
  );
}
