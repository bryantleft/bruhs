import { type ComponentRef, type RefObject, useId, useRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import type { SkinId } from '../../game/content';
import { getSkin } from '../../game/game';
import { color, font, layout, radius, space } from '../../theme/theme';
import { Bruh } from '../Bruh';
import { Button, Copy } from '../ui';
import { ConsentCheckbox } from './ConsentCheckbox';
import { PARTY_LABEL } from './labels';

export type PartyFormMode = 'create' | 'join' | 'profile';

// Create or join a party, or edit the party profile. The screen owns the drafts and submits.
export function PartyForm({
  mode,
  skin,
  name,
  onName,
  nameError,
  nameInput,
  code,
  onCode,
  codeError,
  consent,
  onToggleConsent,
  busy,
  saving,
  canSubmit,
  onSubmit,
  onCancel,
}: Readonly<{
  mode: PartyFormMode;
  skin: SkinId;
  name: string;
  onName: (name: string) => void;
  nameError: string | undefined;
  nameInput: RefObject<ComponentRef<typeof TextInput> | null>;
  code: string;
  onCode: (code: string) => void;
  codeError: string | undefined;
  consent: boolean;
  onToggleConsent: () => void;
  busy: boolean;
  saving: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}>): React.JSX.Element {
  const fieldId = useId();
  const nameErrorId = `${fieldId}-name-error`;
  const codeErrorId = `${fieldId}-code-error`;
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);
  const bruh = getSkin(skin);
  return (
    <View style={styles.form}>
      {mode === 'profile' ? (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Party bruh: ${bruh.name}`}
          style={styles.profileBruh}
        >
          <Bruh skin={skin} size={72} />
          <Copy variant="small" style={styles.profileBruhName}>
            {bruh.name}
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
          onChangeText={onName}
          accessibilityLabel={PARTY_LABEL.name}
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
          onSubmitEditing={() => (mode === 'join' ? codeInput.current?.focus() : onSubmit())}
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
            onChangeText={onCode}
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
            onSubmitEditing={onSubmit}
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
          <ConsentCheckbox checked={consent} disabled={busy} onToggle={onToggleConsent} />
          <Copy variant="label" style={styles.label}>
            guest login has no recovery after reinstall.
          </Copy>
        </>
      ) : null}
      <Button
        label={
          saving
            ? 'saving…'
            : mode === 'join'
              ? 'join party'
              : mode === 'profile'
                ? 'save profile'
                : 'create party'
        }
        onPress={onSubmit}
        disabled={!canSubmit || busy}
        icon={mode === 'profile' ? 'check' : 'party'}
      />
      {mode === 'profile' ? (
        <Button label="cancel" variant="ghost" disabled={busy} onPress={onCancel} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
