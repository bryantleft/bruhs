import { useIsFocused } from 'expo-router';
import { type ComponentRef, type RefCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Platform, type Pressable, StyleSheet, View } from 'react-native';
import { space } from '../theme/theme';
import type { IconName } from './Icon';
import { keepFocusVisible, keepFocusVisibleOnFocus } from './keepFocusVisible';
import { Button, Copy } from './ui';

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

type ConfirmActionProps = Readonly<{
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  description?: string;
  error?: string;
  onRecover?: () => void;
  buttonRef?: RefCallback<ComponentRef<typeof Pressable>>;
  icon?: IconName;
  variant?: 'outline' | 'ghost';
  cancelVariant?: 'outline' | 'ghost';
  disabled?: boolean;
}>;

// Two taps for anything that erases progress. Inside a route, leaving the screen cancels the
// confirmation.
export function ConfirmAction(props: ConfirmActionProps): React.JSX.Element {
  const focused = useIsFocused();
  return <ConfirmActionCore {...props} focused={focused} />;
}

// The same control for screens outside the route tree, such as the load-error screen, which
// are always in view.
export function ConfirmActionCore({
  label,
  confirmLabel,
  cancelLabel,
  onConfirm,
  description,
  error,
  onRecover,
  buttonRef,
  icon,
  variant = 'outline',
  cancelVariant = 'ghost',
  disabled = false,
  focused = true,
}: ConfirmActionProps & Readonly<{ focused?: boolean }>): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const descriptionId = useId();
  const activeDescription = confirming && description ? description : undefined;
  const actions = useRef<ComponentRef<typeof View>>(null);
  const button = useRef<ComponentRef<typeof Pressable>>(null);
  const setButton = useMemo<RefCallback<ComponentRef<typeof Pressable>>>(() => {
    let detach: (() => void) | undefined;
    return (node) => {
      detach?.();
      if (!node) return;
      button.current = node;
      const cleanup = buttonRef?.(node);
      const release = () => {
        if (detach !== release) return;
        detach = undefined;
        if (button.current === node) button.current = null;
        if (typeof cleanup === 'function') cleanup();
        else buttonRef?.(null);
      };
      detach = release;
      return release;
    };
  }, [buttonRef]);
  const returnFocus = useRef(false);
  const visibilityFrame = useRef<number | null>(null);
  const keepActionVisible = (): void => {
    const container = actions.current;
    if (
      Platform.OS === 'web' &&
      container instanceof HTMLElement &&
      container.contains(document.activeElement)
    )
      keepFocusVisibleOnFocus(container.closest('[data-focus-content]'));
  };
  useEffect(() => {
    const cancelReturnFocus = (): void => {
      returnFocus.current = false;
    };
    if (Platform.OS === 'web') {
      window.addEventListener('wheel', cancelReturnFocus, { capture: true, passive: true });
      window.addEventListener('touchstart', cancelReturnFocus, { capture: true, passive: true });
    }
    return () => {
      if (visibilityFrame.current !== null) cancelAnimationFrame(visibilityFrame.current);
      if (Platform.OS === 'web') {
        window.removeEventListener('wheel', cancelReturnFocus, true);
        window.removeEventListener('touchstart', cancelReturnFocus, true);
      }
    };
  }, []);
  useEffect(() => {
    if (!focused) {
      returnFocus.current = false;
      setConfirming(false);
      return;
    }
    // Cancel removes itself; resetting temporarily disables the action.
    // Restore from BODY without overriding a deliberate move to another control.
    if (!confirming && !disabled && returnFocus.current) {
      returnFocus.current = false;
      const target = button.current;
      if (
        Platform.OS === 'web' &&
        target instanceof HTMLElement &&
        target.isConnected &&
        document.activeElement === document.body &&
        !target.closest('[inert], [aria-hidden="true"]')
      ) {
        target.focus({ preventScroll: true });
        keepFocusVisible(target.closest('[data-focus-content]'));
      }
    }
  }, [confirming, disabled, focused]);
  return (
    <View
      ref={actions}
      style={styles.actions}
      onLayout={keepActionVisible}
      onKeyDownCapture={
        Platform.OS === 'web'
          ? (event) => {
              const { key, repeat } = event.nativeEvent;
              // A held key must not open confirmation and approve it on repeat.
              if (repeat && isActivationKey(key)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }
          : undefined
      }
      onKeyUpCapture={
        Platform.OS === 'web'
          ? (event) => {
              if (!isActivationKey(event.nativeEvent.key)) return;
              if (visibilityFrame.current !== null) cancelAnimationFrame(visibilityFrame.current);
              // Press feedback scales the button; measure its full size after release.
              visibilityFrame.current = requestAnimationFrame(() => {
                visibilityFrame.current = null;
                keepActionVisible();
              });
            }
          : undefined
      }
    >
      {error ? (
        <Copy variant="small" accessibilityRole="alert" style={styles.description}>
          {error}
        </Copy>
      ) : null}
      {error && onRecover ? (
        <Button
          label="refresh"
          variant="outline"
          icon="refresh"
          disabled={disabled}
          onPress={() => {
            returnFocus.current = false;
            setConfirming(false);
            onRecover();
          }}
        />
      ) : null}
      {activeDescription ? (
        <Copy
          nativeID={Platform.OS === 'web' ? descriptionId : undefined}
          variant="small"
          style={styles.description}
        >
          {activeDescription}
        </Copy>
      ) : null}
      <Button
        buttonRef={setButton}
        label={confirming ? confirmLabel : label}
        accessibilityHint={activeDescription}
        descriptionId={activeDescription ? descriptionId : undefined}
        variant={variant}
        icon={icon}
        disabled={disabled}
        onPress={() => {
          if (confirming) {
            if (Platform.OS === 'web') returnFocus.current = button.current === document.activeElement;
            setConfirming(false);
            onConfirm();
          } else setConfirming(true);
        }}
      />
      {confirming ? (
        <Button
          label={cancelLabel}
          variant={cancelVariant}
          onPress={() => {
            returnFocus.current = true;
            setConfirming(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.related },
  description: { textAlign: 'center' },
});
