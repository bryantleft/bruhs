import { type ComponentRef, useRef, useState } from 'react';
import { Platform, Share, StyleSheet, type TextInput, View } from 'react-native';
import { Bruh } from '../components/Bruh';
import { ConfirmAction } from '../components/ConfirmAction';
import { Board } from '../components/party/Board';
import { byLabel, PARTY_LABEL } from '../components/party/labels';
import { PartyForm } from '../components/party/PartyForm';
import { Button, Copy, IconButton, Screen } from '../components/ui';
import { inviteCode, type PartyError, partyErrorCopy, validPartyName } from '../friends/model';
import { useParty } from '../friends/PartyProvider';
import { sharingErrorCopy } from '../friends/sharing';
import { usePartyActionFocus } from '../friends/usePartyActionFocus';
import { useGame } from '../game/GameProvider';
import { backToAdventure, useScreenFocus, useScreenLink } from '../navigation/useScreenFocus';
import { color, font, radius, space } from '../theme/theme';

function departureError(error: PartyError, action: 'leave' | 'delete'): string {
  if (error === 'session') return 'refresh your login.';
  if (error === 'data') return 'refresh party data.';
  if (error === 'network')
    return action === 'leave' ? 'could not leave. try again.' : 'could not delete profile. try again.';
  return partyErrorCopy(error);
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
              label={PARTY_LABEL.refresh}
              disabled={busy || sharing.status === 'syncing'}
              loading={readRequestId !== null || operation === 'session' || sharing.status === 'syncing'}
              onPress={() => {
                void act(refresh, (container) => byLabel(container, PARTY_LABEL.refresh));
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
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);
  const busy = operation !== null;
  const cleanCode = inviteCode(code);
  const validName = validPartyName(name);
  const canSubmit = validName && (mode === 'profile' || consent) && (mode !== 'join' || cleanCode !== null);
  const nameError = name && !validName ? 'use 1–24 characters, on one line.' : undefined;
  const codeError = code && !cleanCode ? 'use the full 32-character code.' : undefined;
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
        ? (container) => byLabel(container, PARTY_LABEL.editProfile, ':not([aria-disabled="true"])')
        : undefined,
    );
  }

  const cancelProfile = (): void => {
    void act(
      async () => {
        setEditing(false);
        setMode('create');
        return true;
      },
      (container) => byLabel(container, PARTY_LABEL.editProfile),
    );
  };
  const form = (
    <PartyForm
      mode={mode}
      skin={game.equipped}
      name={name}
      onName={setName}
      nameError={nameError}
      nameInput={nameInput}
      code={code}
      onCode={setCode}
      codeError={codeError}
      consent={consent}
      onToggleConsent={() => setConsent((value) => !value)}
      busy={busy}
      saving={operation === 'enter'}
      canSubmit={canSubmit}
      onSubmit={submit}
      onCancel={cancelProfile}
    />
  );
  const cancelControl =
    readRequestId !== null ? (
      <Button
        key={`cancel-read-${readRequestId}`}
        label="cancel"
        accessibilityLabel={operation === 'more' ? PARTY_LABEL.cancelMore : PARTY_LABEL.cancelRefresh}
        variant="outline"
        icon="close"
        onPress={() => {
          void act(
            async () => cancelRead(readRequestId),
            (container) =>
              operation === 'more'
                ? byLabel(container, PARTY_LABEL.loadMore)
                : (byLabel(container, PARTY_LABEL.refresh) ?? byLabel(container, PARTY_LABEL.tryAgain)),
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
              ? sharingErrorCopy(sharing.reason)
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
          {visibleError !== 'invite' && visibleError !== 'membership' && visibleError !== 'full' ? (
            <Button
              label={PARTY_LABEL.tryAgain}
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
          <Button label={PARTY_LABEL.tryAgain} variant="outline" icon="refresh" onPress={recoverParty} />
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
          <Board rows={rows} userId={state.identity.userId} waiting={readRequestId !== null} />
          {hasMore && operation === 'more' ? (
            cancelControl
          ) : hasMore ? (
            <Button
              key="load-more"
              label={PARTY_LABEL.loadMore}
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
                  (container) => byLabel(container, PARTY_LABEL.cancelMore),
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
              label={PARTY_LABEL.editProfile}
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
                  (container) => byLabel(container, PARTY_LABEL.name),
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
  label: { color: color.secondary },
  week: { gap: space.micro },
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
