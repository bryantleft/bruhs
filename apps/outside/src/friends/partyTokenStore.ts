import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TokenStore } from './tokenStorage';

// Web keeps the login where it always was: AsyncStorage, which is localStorage in the
// browser. expo-secure-store has no web implementation, and Convex Auth's own React
// Native setup uses SecureStore on iOS and Android only.
// https://labs.convex.dev/auth/setup (React Native tab)
// Native builds use partyTokenStore.native.ts.
export function createPartyTokenStore(): TokenStore {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  };
}
