import { type ComponentRef, useId, useRef, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { Bruh } from '../components/Bruh';
import { ConfirmAction } from '../components/ConfirmAction';
import { Icon } from '../components/Icon';
import { Button, Copy, IconButton, Screen } from '../components/ui';
import {
  inviteCode,
  type PartyError,
  type PartyMember,
  partyErrorCopy,
  validPartyName,
} from '../friends/model';
import { useParty } from '../friends/PartyProvider';
import { usePartyActionFocus } from '../friends/usePartyActionFocus';
import { useGame } from '../game/GameProvider';
import { getSkin } from '../game/game';
import { formatSteps } from '../game/labels';
import { backToAdventure, useScreenFocus, useScreenLink } from '../navigation/useScreenFocus';
import { color, font, layout, radius, space, typography } from '../theme/theme';

function departureError(error: PartyError, action: 'leave' | 'delete'): string {
  if (error === 'session') return 'refresh your login.';
  if (error === 'data') return 'refresh party data.';
  if (error === 'network')
    return action === 'leave' ? 'could not leave. try again.' : 'could not delete profile. try again.';
  return partyErrorCopy(error);
}

function Member({ member, mine }: Readonly<{ member: PartyMember; mine: boolean }>): React.JSX.Element {
  const rank = member.place === null ? '—' : `${member.tied && member.tied > 1 ? '=' : ''}${member.place}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: React Native View supplies the platform element.
    <View
      style={[styles.member, mine && styles.myRow]}
      accessible
      role="listitem"
      {...(Platform.OS === 'web' ? { dataSet: { partyMember: member.id }, tabIndex: -1 } : {})}
      accessibilityLabel={`${member.name}${mine ? ', you' : ''}. ${member.steps === null ? 'No steps shared this week' : `${member.tied && member.tied > 1 ? 'Tied for ' : ''}place ${member.place}. ${formatSteps(member.steps)}`}`}
    >
      <Copy variant="label" style={[styles.rank, member.place === 1 && { color: color.primary }]}>
        {rank}
      </Copy>
      <Bruh skin={member.skin} size={44} />
      <View style={styles.memberCopy}>
        <Copy style={styles.memberName}>
          {member.name}
          {mine ? (
            <Copy variant="inherit" style={{ color: color.secondary }}>
              {' ·\u00a0you'}
            </Copy>
          ) : null}
        </Copy>
        <Copy variant="small" style={{ color: member.steps === null ? color.secondary : color.success }}>
          {member.steps === null ? 'not synced' : formatSteps(member.steps)}
        </Copy>
      </View>
    </View>
  );
}

export default function PartyScreen(): React.JSX.Element {
  const root = useScreenFocus();
  const { state, operation, readRequestId, sharing, refresh } = useParty();
  const busy = operation !== null;
  const act = usePartyActionFocus(root, busy && readRequestId === null);
  const profileId = state.identity.home.profile?.id ?? 'guest';
  const party = state.identity.home.party;
  const partyId = party?.id ?? 'unjoined';
  return (
    <Screen
      rootRef={root}
      bottomSafeArea
      keyboardShouldPersistTaps={Platform.OS === 'web' ? undefined : 'handled'}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' ? true : undefined}
    >
      <View style={styles.navigation}>
        <IconButton icon="back" label="Back to your adventure" onPress={() => backToAdventure('/party')} />
        <Copy variant="title" style={styles.title}>
          party
        </Copy>
        {party ? (
          <View style={styles.refreshSlot}>
            <IconButton
              icon="refresh"
              label="Refresh party and share Health steps"
              disabled={busy || sharing.status === 'syncing'}
              loading={readRequestId !== null || operation === 'session' || sharing.status === 'syncing'}
              onPress={() => {
                void act(refresh, (container) =>
                  container.querySelector('[aria-label="Refresh party and share Health steps"]'),
                );
              }}
            />
          </View>
        ) : null}
      </View>
      {/* Drafts survive same-party refreshes and sessions without a saved profile. */}
      <PartyContents key={`${profileId}:${partyId}`} act={act} />
    </Screen>
  );
}

function PartyContents({
  act,
}: Readonly<{ act: ReturnType<typeof usePartyActionFocus> }>): React.JSX.Element {
  const fieldId = useId();
  const healthLink = useScreenLink('/health');
  const { game, demo } = useGame();
  const {
    available,
    hasSession,
    state,
    operation,
    readRequestId,
    cancelRead,
    error,
    errorOperation,
    sharing,
    week,
    enter,
    refresh,
    loadMore,
    leave,
    deleteProfile,
  } = useParty();
  const profile = state.identity.home.profile;
  const equippedBruh = getSkin(game.equipped);
  const party = state.identity.home.party;
  const currentBoard = state.week === week.start;
  const rows = currentBoard ? state.rows : [];
  const hasMore = currentBoard && state.offset > 0 && state.offset < state.total;
  const [mode, setMode] = useState<'create' | 'join' | 'profile'>('create');
  const [name, setName] = useState(profile?.name ?? '');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [hasSubmittedInvite, setHasSubmittedInvite] = useState(false);
  const [editing, setEditing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [consentLineHeight, setConsentLineHeight] = useState<number>(typography.small.lineHeight);
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);
  const busy = operation !== null;
  const cleanCode = inviteCode(code);
  const validName = validPartyName(name);
  const canSubmit = validName && (mode === 'profile' || consent) && (mode !== 'join' || cleanCode !== null);
  const nameError = name && !validName ? 'use 1–24 characters, on one line.' : undefined;
  const codeError = code && !cleanCode ? 'use the full 32-character code.' : undefined;
  const nameErrorId = `${fieldId}-name-error`;
  const codeErrorId = `${fieldId}-code-error`;
  const needsRecovery = error === 'session' || error === 'data';
  const visibleError = error === 'invite' && !hasSubmittedInvite ? null : error;

  function recoverParty(): void {
    void act(refresh);
  }

  async function deletePartyProfile(): Promise<boolean> {
    const result = await deleteProfile();
    if (!result) return false;
    // Guests without a saved profile keep the same form key after deletion.
    setName('');
    setCode('');
    setConsent(false);
    setHasSubmittedInvite(false);
    setMode('create');
    setEditing(false);
    setShareError(false);
    return true;
  }

  function submit(): void {
    if (!canSubmit || busy) return;
    void act(
      async () => {
        setHasSubmittedInvite(mode === 'join');
        const result = await enter(
          mode === 'join' && cleanCode
            ? { kind: 'join', name, skin: game.equipped, invite: cleanCode }
            : { kind: mode === 'profile' ? 'profile' : 'create', name, skin: game.equipped },
        );
        if (result) {
          setEditing(false);
          setMode('create');
          setConsent(false);
        }
        return result;
      },
      mode === 'profile'
        ? (container) =>
            container.querySelector('[aria-label="edit party profile"]:not([aria-disabled="true"])')
        : undefined,
    );
  }

  const form = (
    <View style={styles.form}>
      {mode === 'profile' ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Party bruh: ${equippedBruh.name}`}
          style={styles.profileBruh}
        >
          <Bruh skin={game.equipped} size={72} />
          <Copy variant="small" style={styles.profileBruhName}>
            {equippedBruh.name}
          </Copy>
        </View>
      ) : null}
      <View style={styles.field}>
        <Copy variant="small" style={styles.label}>
          your name
        </Copy>
        <TextInput
          ref={nameInput}
          value={name}
          onChangeText={setName}
          accessibilityLabel="Your name"
          accessibilityHint={Platform.OS === 'web' ? undefined : nameError}
          {...(Platform.OS === 'web' && nameError
            ? { 'aria-invalid': true, 'aria-describedby': nameErrorId }
            : {})}
          placeholder="bruh name"
          placeholderTextColor={color.secondary}
          maxLength={48}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          returnKeyType={mode === 'join' ? 'next' : 'done'}
          submitBehavior={Platform.OS !== 'web' && mode === 'join' ? 'submit' : undefined}
          onSubmitEditing={() => (mode === 'join' ? codeInput.current?.focus() : submit())}
          style={styles.input}
        />
        {nameError ? (
          <Copy nativeID={nameErrorId} variant="label" style={styles.label}>
            {nameError}
          </Copy>
        ) : null}
      </View>
      {mode === 'join' ? (
        <View style={styles.field}>
          <Copy variant="small" style={styles.label}>
            invite code
          </Copy>
          <TextInput
            ref={codeInput}
            value={code}
            onChangeText={setCode}
            accessibilityLabel="Party invite code"
            accessibilityHint={Platform.OS === 'web' ? undefined : codeError}
            {...(Platform.OS === 'web' && codeError
              ? { 'aria-invalid': true, 'aria-describedby': codeErrorId }
              : {})}
            placeholder="paste your friend’s code"
            placeholderTextColor={color.secondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={styles.input}
          />
          {codeError ? (
            <Copy nativeID={codeErrorId} variant="label" style={styles.label}>
              {codeError}
            </Copy>
          ) : null}
        </View>
      ) : null}
      {mode !== 'profile' ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent, disabled: busy }}
            aria-checked={consent}
            aria-disabled={busy}
            onKeyDownCapture={
              Platform.OS === 'web'
                ? (event) => {
                    const { key, repeat } = event.nativeEvent;
                    if (key !== ' ' && key !== 'Enter') return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (!busy && !repeat) setConsent((value) => !value);
                  }
                : undefined
            }
            onKeyUpCapture={
              Platform.OS === 'web'
                ? (event) => {
                    if (event.nativeEvent.key === ' ' || event.nativeEvent.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }
                : undefined
            }
            accessibilityLabel="Share my name, bruh and daily steps with party members"
            disabled={busy}
            onPress={() => setConsent((value) => !value)}
            style={({ pressed }) => [styles.consent, pressed && { backgroundColor: color.raised }]}
          >
            <View aria-hidden accessible={false} pointerEvents="none" style={styles.consentMeasurement}>
              <Copy
                variant="small"
                aria-hidden
                accessible={false}
                onLayout={({ nativeEvent }) => {
                  const target = 'target' in nativeEvent ? nativeEvent.target : null;
                  const height =
                    Platform.OS === 'web' && target instanceof HTMLElement
                      ? target.getBoundingClientRect().height
                      : nativeEvent.layout.height;
                  if (height > 0) setConsentLineHeight(height);
                }}
              >
                M
              </Copy>
            </View>
            <View
              aria-hidden
              style={[
                styles.check,
                // Preserve the normal offset as the first text line grows.
                { marginTop: 2 + Math.max(0, (consentLineHeight - typography.small.lineHeight) / 2) },
                consent && styles.checked,
              ]}
            >
              {consent ? <Icon name="check" tint={color.canvas} /> : null}
            </View>
            <Copy variant="small" style={styles.consentCopy}>
              share my name, bruh and daily steps with party members.
            </Copy>
          </Pressable>
          <Copy variant="label" style={styles.label}>
            guest login has no recovery after reinstall.
          </Copy>
        </>
      ) : null}
      <Button
        label={
          operation === 'enter'
            ? 'saving…'
            : mode === 'join'
              ? 'join party'
              : mode === 'profile'
                ? 'save profile'
                : 'create party'
        }
        onPress={submit}
        disabled={!canSubmit || busy}
        icon={mode === 'profile' ? 'check' : 'party'}
      />
      {mode === 'profile' ? (
        <Button
          label="cancel"
          variant="ghost"
          disabled={busy}
          onPress={() => {
            void act(
              async () => {
                setEditing(false);
                setMode('create');
                return true;
              },
              (container) => container.querySelector('[aria-label="edit party profile"]'),
            );
          }}
        />
      ) : null}
    </View>
  );
  const cancelControl =
    readRequestId !== null ? (
      <Button
        key={`cancel-read-${readRequestId}`}
        label="cancel"
        accessibilityLabel={operation === 'more' ? 'Cancel loading more bruhs' : 'Cancel party refresh'}
        variant="outline"
        icon="close"
        onPress={() => {
          void act(
            async () => cancelRead(readRequestId),
            (container) =>
              operation === 'more'
                ? container.querySelector('[aria-label="more bruhs"]')
                : (container.querySelector('[aria-label="Refresh party and share Health steps"]') ??
                  container.querySelector('[aria-label="try again"]')),
          );
        }}
      />
    ) : null;
  const sharingCopy = demo
    ? 'only phone Health steps count. demo steps stay here.'
    : !game.health?.enabled
      ? 'connect step sync to enter your steps.'
      : sharing.status === 'syncing'
        ? 'syncing this week’s steps…'
        : sharing.status === 'no-data'
          ? 'no readable steps yet. check Health access.'
          : sharing.status === 'permission'
            ? 'step access is off. reconnect step sync.'
            : sharing.status === 'error'
              ? 'step sharing failed. tap refresh to try again.'
              : 'phone steps sync when you open the app or tap refresh.';
  const weekLabel = `${new Date(`${week.start}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(`${week.end}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;

  return (
    <>
      {operation === 'more' && hasMore ? null : cancelControl}
      {visibleError && errorOperation !== 'leave' && errorOperation !== 'delete' ? (
        <View style={styles.error}>
          <Copy variant="small" accessibilityRole="alert" style={styles.label}>
            {partyErrorCopy(visibleError)}
          </Copy>
          {visibleError !== 'invite' && visibleError !== 'membership' ? (
            <Button
              label="try again"
              variant="outline"
              disabled={busy}
              onPress={() => {
                void act(refresh);
              }}
            />
          ) : null}
        </View>
      ) : null}
      {!available ? (
        <Copy>party is offline. try later.</Copy>
      ) : state.status === 'idle' ? (
        <View style={styles.hero}>
          <Copy>party not loaded.</Copy>
          <Button label="try again" variant="outline" icon="refresh" onPress={recoverParty} />
        </View>
      ) : state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your party"
          style={styles.hero}
        >
          <Bruh size={80} skin={game.equipped} />
        </View>
      ) : !party ? (
        <>
          {mode !== 'profile' ? (
            <Button
              label={mode === 'create' ? 'have an invite?' : 'create a party instead'}
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setMode(mode === 'create' ? 'join' : 'create');
                setConsent(false);
                setHasSubmittedInvite(false);
                nameInput.current?.focus();
              }}
            />
          ) : null}
          <View style={styles.hero}>
            <View style={styles.partyArt} aria-hidden pointerEvents="none">
              <Bruh size={72} skin="durian" />
              <View style={styles.frontBruh}>
                <Bruh size={104} skin={game.equipped} />
              </View>
              <Bruh size={72} skin="blueberry" />
            </View>
            <Copy variant="heading" style={styles.heroText}>
              walk with bruhs.
            </Copy>
            <Copy variant="small" style={[styles.label, styles.heroText]}>
              a private weekly step race.
            </Copy>
          </View>
          {form}
        </>
      ) : (
        <>
          <View style={styles.week}>
            <Copy variant="heading">this week</Copy>
            <Copy variant="small" style={styles.label}>
              {weekLabel}
            </Copy>
            <Copy variant="label" style={styles.label}>
              resets Monday · 00:00 UTC
            </Copy>
          </View>
          {/* biome-ignore lint/a11y/useSemanticElements: React Native View supplies the platform element. */}
          <View style={styles.board} role="list" accessibilityLabel="Weekly party leaderboard">
            {rows.map((member) => (
              <Member key={member.id} member={member} mine={member.id === state.identity.userId} />
            ))}
            {!rows.length ? (
              <Copy style={styles.boardEmpty}>
                {readRequestId !== null ? 'waiting for your party…' : 'refresh to load your party.'}
              </Copy>
            ) : null}
          </View>
          {hasMore && operation === 'more' ? (
            cancelControl
          ) : hasMore ? (
            <Button
              key="load-more"
              label="more bruhs"
              variant="outline"
              disabled={busy}
              onPress={() => {
                const seen = new Set(state.rows.map((member) => member.id));
                void act(
                  loadMore,
                  (container) =>
                    Array.from(container.querySelectorAll<HTMLElement>('[data-party-member]')).find(
                      (row) => !seen.has(row.dataset.partyMember ?? ''),
                    ) ?? null,
                  (container) => container.querySelector('[aria-label="Cancel loading more bruhs"]'),
                );
              }}
            />
          ) : null}
          <View style={styles.sync}>
            <Copy variant="small" style={styles.label} accessibilityLiveRegion="polite">
              {sharingCopy}
            </Copy>
            {!demo && (!game.health?.enabled || sharing.status === 'permission') ? (
              <Button
                buttonRef={healthLink.buttonRef}
                label="step sync"
                variant="outline"
                icon="health"
                onPress={healthLink.open}
              />
            ) : null}
          </View>
          <View style={styles.invitation}>
            <Copy variant="heading">invite a bruh</Copy>
            <Copy selectable accessibilityLabel={`Party invite code: ${party.invite}`} style={styles.code}>
              {party.invite.match(/.{1,8}/g)?.join(' ')}
            </Copy>
            <View style={styles.shareAction}>
              <Button
                label="share code"
                variant="outline"
                icon="party"
                onPress={() => {
                  setShareError(false);
                  void Share.share({
                    message: `join my bruhs outside party.\ninvite code: ${party.invite}`,
                  }).catch((error: unknown) => {
                    // Web Share uses AbortError for dismissal or no available targets.
                    // The selectable code remains available in both cases.
                    if (
                      Platform.OS === 'web' &&
                      error !== null &&
                      typeof error === 'object' &&
                      'name' in error &&
                      error.name === 'AbortError'
                    )
                      return;
                    setShareError(true);
                  });
                }}
              />
              {shareError ? (
                <Copy variant="small" style={styles.label} accessibilityLiveRegion="polite">
                  copy the code above.
                </Copy>
              ) : null}
            </View>
          </View>
          {editing ? (
            form
          ) : (
            <Button
              label="edit party profile"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                void act(
                  async () => {
                    setName(profile?.name ?? '');
                    setMode('profile');
                    setEditing(true);
                    return true;
                  },
                  (container) => container.querySelector('input[aria-label="Your name"]'),
                );
              }}
            />
          )}
          <ConfirmAction
            label={operation === 'leave' ? 'leaving…' : 'leave party'}
            confirmLabel="yes, leave party"
            cancelLabel="stay in party"
            description="removes your shared steps. your adventure stays on this device."
            error={error && errorOperation === 'leave' ? departureError(error, 'leave') : undefined}
            onRecover={errorOperation === 'leave' && needsRecovery ? recoverParty : undefined}
            onConfirm={() => {
              void act(leave);
            }}
            disabled={busy}
            variant="ghost"
          />
        </>
      )}
      {available && hasSession ? (
        <ConfirmAction
          label={operation === 'delete' ? 'deleting…' : 'delete party profile'}
          confirmLabel="yes, delete party profile"
          cancelLabel="keep my profile"
          description="deletes your party login, name and shared steps. your local adventure stays intact."
          error={error && errorOperation === 'delete' ? departureError(error, 'delete') : undefined}
          onRecover={errorOperation === 'delete' && needsRecovery ? recoverParty : undefined}
          onConfirm={() => {
            void act(deletePartyProfile);
          }}
          disabled={busy}
          variant="ghost"
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  navigation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.tight,
    marginHorizontal: -space.tight,
  },
  title: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', maxWidth: '100%' },
  refreshSlot: { marginLeft: 'auto' },
  hero: { alignItems: 'center', gap: space.tight },
  heroText: { maxWidth: '100%', textAlign: 'center' },
  partyArt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.group,
    maxWidth: '100%',
  },
  frontBruh: { marginHorizontal: -space.related, zIndex: 1 },
  form: { gap: space.group },
  profileBruh: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.group,
    rowGap: space.related,
  },
  profileBruhName: { flexShrink: 0, maxWidth: '100%', color: color.secondary },
  field: { gap: space.tight },
  label: { color: color.secondary },
  input: {
    minHeight: layout.button,
    paddingHorizontal: space.group,
    paddingVertical: space.related,
    color: color.text,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.strongBorder,
    borderRadius: radius.lychee,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: '100%',
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.related,
    minHeight: layout.touch,
    paddingVertical: space.tight,
    paddingHorizontal: space.micro,
    borderRadius: radius.grape,
  },
  consentMeasurement: { position: 'absolute', top: 0, left: 0, opacity: 0, alignItems: 'flex-start' },
  check: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: color.secondary,
    borderRadius: radius.seed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checked: { backgroundColor: color.success, borderColor: color.success },
  consentCopy: { flex: 1, minWidth: 0, color: color.secondary },
  week: { gap: space.micro },
  board: { gap: space.tight },
  boardEmpty: { paddingVertical: space.group },
  member: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.related,
    rowGap: space.tight,
    padding: space.related,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.lychee,
  },
  myRow: { borderColor: `${color.success}50`, backgroundColor: color.panel },
  rank: { minWidth: 20, maxWidth: '100%', color: color.secondary, fontVariant: ['tabular-nums'] },
  memberCopy: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
    gap: space.micro,
  },
  memberName: {
    fontFamily: font.label,
    fontSize: typography.small.fontSize,
    lineHeight: typography.small.lineHeight,
    color: color.text,
  },
  sync: { gap: space.related },
  invitation: { gap: space.group, paddingTop: space.group, borderTopWidth: 1, borderColor: color.border },
  shareAction: { gap: space.tight },
  code: { fontFamily: font.label, fontSize: 16, lineHeight: 26, color: color.success },
  error: {
    gap: space.related,
    padding: space.related,
    borderWidth: 1,
    borderColor: `${color.primary}70`,
    borderRadius: radius.lychee,
    backgroundColor: color.panel,
  },
});
