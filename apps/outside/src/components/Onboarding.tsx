import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useParty } from '../friends/PartyProvider';
import { useGame } from '../game/GameProvider';
import { type Art, SKILL_ART, UI_ART } from '../pixel/art';
import { bevel } from '../pixel/chrome';
import { Sprite } from '../pixel/Sprite';
import { color, font, shadow, space } from '../theme/theme';
import { Bruh } from './Bruh';
import { Icon, type IconName } from './Icon';
import { Button } from './ui';

const PRIVACY_POLICY = 'https://outside.bruhs.app/privacy/#app';

type Point = Readonly<{ title: string; body: string }>;

function Row({
  art,
  icon,
  title,
  body,
}: Point & Readonly<{ art?: Art; icon?: IconName }>): React.JSX.Element {
  return (
    <View style={styles.point}>
      <View style={[styles.pointIcon, bevel('well')]}>
        {art ? <Sprite art={art} size={24} /> : icon ? <Icon name={icon} tint={color.success} /> : null}
      </View>
      <View style={styles.grow}>
        <Text style={styles.pointTitle}>{title}</Text>
        <Text style={styles.pointBody}>{body}</Text>
      </View>
    </View>
  );
}

// The first two screens a new save sees. One says how steps become an adventure; the next
// explains step access before the system's one-time Health prompt, then hands over to the
// world, where the next-step button teaches the rest as it comes up.
export function Onboarding(): React.JSX.Element {
  const { game, demo, tracking, connect, act } = useGame();
  const { available: hasParties } = useParty();
  const [page, setPage] = useState<'welcome' | 'steps'>('welcome');
  const [asked, setAsked] = useState(false);
  const provider = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const finish = (): void => {
    act({ type: 'onboarded' });
  };
  // Whatever the prompt's answer, the first read settles it. A missing permission shows up on
  // the world as a row that opens settings, so the player is never stuck here.
  const settled = asked && tracking.status !== 'syncing' && tracking.status !== 'idle';
  useEffect(() => {
    if (settled) act({ type: 'onboarded' });
  }, [settled, act]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.count} accessibilityLabel={`Step ${page === 'welcome' ? 1 : 2} of 2`}>
          {page === 'welcome' ? '1 / 2' : '2 / 2'}
        </Text>
        {page === 'welcome' ? (
          <>
            <View style={styles.hero}>
              <Bruh skin={game.equipped} size={100} />
              <Text accessibilityRole="header" aria-level={1} style={styles.title}>
                welcome outside
              </Text>
              <Text style={styles.tagline}>touch grass. level up.</Text>
            </View>
            <View style={styles.points}>
              <Row
                art={UI_ART.steps}
                title="walk in real life"
                body="every step you take lands in your pouch."
              />
              <Row
                art={SKILL_ART.woodcutting}
                title="spend steps on adventure"
                body="travel the fruitlands and chop, fish, mine and craft your way up."
              />
              <Row
                art={UI_ART.bag}
                title="your bruh keeps working"
                body="pick a job and your bruh carries on while you walk, then shows you the loot."
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.hero}>
              <Bruh skin={game.equipped} size={100} />
              <Text accessibilityRole="header" aria-level={1} style={styles.title}>
                {demo ? 'sample steps' : 'bring your steps'}
              </Text>
              <Text style={styles.tagline}>
                {demo
                  ? 'this browser demo starts with a week of sample steps. the phone app reads your real ones.'
                  : `outside reads your daily step count from ${provider}. nothing else.`}
              </Text>
            </View>
            {demo ? null : (
              <View style={styles.points}>
                <Row
                  icon="trail"
                  title="read access only"
                  body="daily step totals pay for travel, xp and quests."
                />
                <Row
                  icon="refresh"
                  title="syncs on its own"
                  body="every time you open the app. pull down on the world to sync sooner."
                />
                <Row
                  icon="lock"
                  title={hasParties ? 'your choice' : 'saved on this phone'}
                  body={
                    hasParties
                      ? 'totals stay on this phone unless you join a party race with friends.'
                      : 'daily totals stay on this phone.'
                  }
                />
              </View>
            )}
            {demo ? null : (
              <Button
                label="read the privacy policy"
                variant="ghost"
                accessibilityHint="opens outside.bruhs.app in your browser"
                onPress={() => void Linking.openURL(PRIVACY_POLICY)}
              />
            )}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {page === 'welcome' ? (
          <Button label="next" onPress={() => setPage('steps')} />
        ) : demo ? (
          <Button label="start playing" onPress={finish} />
        ) : (
          <>
            <Button
              label={asked ? `connecting ${provider}…` : `connect ${provider}`}
              icon="health"
              disabled={asked}
              onPress={() => {
                setAsked(true);
                connect();
              }}
            />
            <Button label="not now" variant="ghost" disabled={asked} onPress={finish} />
            <Text style={styles.note}>you can connect later in settings, on the you tab.</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: {
    flexGrow: 1,
    padding: space.page,
    gap: space.section,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  count: {
    alignSelf: 'flex-end',
    fontFamily: font.label,
    fontSize: 10,
    lineHeight: 14,
    color: color.muted,
    ...shadow,
  },
  hero: { alignItems: 'center', gap: space.tight },
  title: {
    fontFamily: font.display,
    fontSize: 28,
    lineHeight: 34,
    color: color.gold,
    textAlign: 'center',
    marginTop: space.related,
    ...shadow,
  },
  tagline: {
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 22,
    color: color.secondary,
    textAlign: 'center',
  },
  points: { gap: space.group },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.related },
  pointIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  pointTitle: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, color: color.text, ...shadow },
  pointBody: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.secondary },
  footer: {
    gap: space.tight,
    paddingHorizontal: space.page,
    paddingBottom: space.related,
    paddingTop: space.tight,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.muted, textAlign: 'center' },
});
