import { FontDisplay, useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStage } from '../components/AppStage';
import { Bruh } from '../components/Bruh';
import { ConfirmActionCore } from '../components/ConfirmAction';
import { MotionProvider } from '../components/MotionProvider';
import { Onboarding } from '../components/Onboarding';
import { RewardOverlay } from '../components/RewardOverlay';
import { Button, Copy } from '../components/ui';
import { useProgressRecoveryFocus } from '../components/useProgressRecoveryFocus';
import { ExploreProvider } from '../explore/ExploreProvider';
import { PartyBackend } from '../friends/PartyBackend';
import { GameProvider, useGame } from '../game/GameProvider';
import { loadFailureCopy } from '../game/session';
import { color, space } from '../theme/theme';

void SplashScreen.preventAutoHideAsync().catch((error: unknown) =>
  console.warn('Splash screen could not be held:', error),
);

function AdventureLoading(): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your adventure"
      aria-busy
      style={[styles.loading, styles.loadingContent]}
    >
      <Bruh size={100} />
    </View>
  );
}

function GameApp(): React.JSX.Element {
  const { game, loading, retryLoad, reset, resetting, resetError } = useGame();
  const recovery = useProgressRecoveryFocus(loading.status);
  const failure = loading.status === 'error' ? loadFailureCopy(loading.failure) : null;
  return (
    <AppStage>
      {loading.status === 'ready' && game.onboarding ? (
        <Onboarding />
      ) : loading.status === 'ready' ? (
        <>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
          <RewardOverlay />
        </>
      ) : loading.status === 'error' ? (
        <ScrollView
          ref={recovery.scroll}
          onLayout={recovery.onLayout}
          onFocus={recovery.onLayout}
          onKeyDownCapture={recovery.onKeyDownCapture}
          style={styles.loading}
          contentContainerStyle={styles.loadingContent}
        >
          <Bruh size={100} />
          <Copy variant="heading">could not load your adventure</Copy>
          <Copy variant="body">{failure?.message} your saved data has been kept.</Copy>
          <View style={styles.recoveryActions}>
            {failure?.retry ? (
              <Button
                buttonRef={recovery.retryRef}
                label="try again"
                icon="refresh"
                disabled={resetting}
                onPress={() => {
                  recovery.prepare();
                  retryLoad();
                }}
              />
            ) : null}
            <Copy variant="small">starting fresh will replace this device’s saved progress.</Copy>
            <ConfirmActionCore
              label={resetting ? 'erasing journey…' : 'start a new adventure'}
              confirmLabel="yes, erase my journey"
              cancelLabel="keep my journey"
              description="erases the saved progress this device can’t read, and your walks. this can’t be undone."
              variant="outline"
              cancelVariant="ghost"
              onConfirm={reset}
              disabled={resetting}
            />
          </View>
          {resetError ? (
            <Copy variant="small" accessibilityLiveRegion="polite" style={{ color: color.primary }}>
              {resetError}
            </Copy>
          ) : null}
        </ScrollView>
      ) : (
        <AdventureLoading />
      )}
    </AppStage>
  );
}

export default function RootLayout(): React.JSX.Element {
  const [mounted, setMounted] = useState(false);
  const [loaded, error] = useFonts({
    'PixelifySans-Regular': {
      uri: require('../../assets/fonts/PixelifySans-Regular.ttf'),
      display: FontDisplay.SWAP,
    },
    'PixelifySans-Bold': {
      uri: require('../../assets/fonts/PixelifySans-Bold.ttf'),
      display: FontDisplay.SWAP,
    },
    'Silkscreen-Regular': {
      uri: require('../../assets/fonts/Silkscreen-Regular.ttf'),
      display: FontDisplay.SWAP,
    },
    'Silkscreen-Bold': {
      uri: require('../../assets/fonts/Silkscreen-Bold.ttf'),
      display: FontDisplay.SWAP,
    },
  });
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (error)
    return (
      <ScrollView style={styles.loading} contentContainerStyle={styles.loadingContent}>
        <Text style={{ color: color.text }}>
          couldn’t load the app’s fonts ({error.message}). restart the app to try again.
        </Text>
      </ScrollView>
    );
  if (!loaded || !mounted) return <AdventureLoading />;
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MotionProvider>
        <ExploreProvider>
          <GameProvider>
            <PartyBackend>
              <GameApp />
            </PartyBackend>
          </GameProvider>
        </ExploreProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  loadingContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  recoveryActions: { alignSelf: 'stretch', gap: space.related },
});
