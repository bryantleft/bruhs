import { type ComponentRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Notice } from '../game/session';
import { color, layout, radius, space, typography } from '../theme/theme';
import { Icon } from './Icon';
import { keepFocusVisibleOnFocus, keepFocusVisibleOnKey } from './keepFocusVisible';

const READING_TIME = 5_000;

export function GameNotice({
  notice,
  onDismiss,
  returnFocus,
  onRetry,
  retrying,
}: Readonly<{
  notice: Notice;
  onDismiss: (notice: Notice) => void;
  returnFocus: () => void;
  onRetry: () => void;
  retrying: boolean;
}>): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [active, setActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [readingTime, setReadingTime] = useState<number | null>(null);
  const [actionHeight, setActionHeight] = useState<number>(layout.touch);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const message = useRef<ComponentRef<typeof Text>>(null);
  const focusWithin = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  useLayoutEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    keepFocusVisibleOnFocus(scroll.current?.getNativeScrollRef());
    let current = true;
    setReadingTime(null);
    if (notice.kind !== 'status') return;
    if (Platform.OS === 'android') {
      void AccessibilityInfo.getRecommendedTimeoutMillis(READING_TIME)
        .then((duration) => {
          if (current)
            setReadingTime(Number.isFinite(duration) ? Math.max(READING_TIME, duration) : READING_TIME);
        })
        .catch(() => {
          if (current) setReadingTime(READING_TIME);
        });
    } else setReadingTime(READING_TIME);
    return () => {
      current = false;
    };
  }, [notice]);
  useEffect(() => {
    if (notice.kind !== 'status' || !readingTime || hovered || hasFocus || !active) return;
    const timer = setTimeout(() => onDismiss(notice), readingTime);
    return () => clearTimeout(timer);
  }, [active, hasFocus, hovered, notice, onDismiss, readingTime]);
  useEffect(() => {
    if (notice.kind === 'status' && focusWithin.current) {
      focusWithin.current = false;
      setHasFocus(false);
      returnFocus();
    }
  }, [notice.kind, returnFocus]);
  useEffect(
    () => () => {
      if (focusWithin.current) returnFocus();
    },
    [returnFocus],
  );
  return (
    <ScrollView
      ref={scroll}
      role={Platform.OS === 'web' ? 'status' : undefined}
      accessibilityLabel={
        Platform.OS === 'web' ? (notice.kind === 'error' ? 'Save error' : notice.message) : undefined
      }
      accessibilityLiveRegion="polite"
      tabIndex={Platform.OS === 'web' ? 0 : undefined}
      onFocus={() => {
        focusWithin.current = true;
        setHasFocus(true);
        keepFocusVisibleOnFocus(scroll.current?.getNativeScrollRef());
      }}
      onBlur={() => {
        focusWithin.current = false;
        setHasFocus(false);
      }}
      onLayout={() => keepFocusVisibleOnFocus(scroll.current?.getNativeScrollRef())}
      onKeyDownCapture={
        Platform.OS === 'web'
          ? (event) => {
              const container = scroll.current?.getNativeScrollRef();
              keepFocusVisibleOnKey(container, event.nativeEvent);
              const key = event.nativeEvent;
              if (
                !(container instanceof HTMLElement) ||
                document.activeElement !== container ||
                key.altKey ||
                key.ctrlKey ||
                key.metaKey
              )
                return;
              const measured =
                message.current instanceof HTMLElement
                  ? Number.parseFloat(getComputedStyle(message.current).lineHeight)
                  : Number.NaN;
              const line = Number.isFinite(measured) ? measured : typography.small.lineHeight;
              const page = Math.max(line, container.clientHeight - space.tight);
              const offset =
                key.key === 'ArrowDown'
                  ? line
                  : key.key === 'ArrowUp'
                    ? -line
                    : key.key === 'PageDown'
                      ? page
                      : key.key === 'PageUp'
                        ? -page
                        : null;
              const y =
                key.key === 'Home'
                  ? 0
                  : key.key === 'End'
                    ? container.scrollHeight
                    : offset === null
                      ? null
                      : container.scrollTop + offset;
              if (y === null) return;
              event.preventDefault();
              scroll.current?.scrollTo({ y: Math.max(0, y), animated: false });
            }
          : undefined
      }
      onPointerEnter={(event) => setHovered(event.nativeEvent.pointerType !== 'touch')}
      onPointerLeave={() => setHovered(false)}
      showsVerticalScrollIndicator
      contentContainerStyle={styles.content}
      style={[
        styles.notice,
        notice.kind === 'error' && [styles.error, { minHeight: actionHeight + space.tight * 2 + 2 }],
        hasFocus && styles.focused,
      ]}
    >
      <Text ref={message} style={[typography.small, styles.message]}>
        {notice.message}
      </Text>
      {notice.kind === 'error' ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={retrying ? 'Saving your progress' : 'Retry saving your progress'}
            accessibilityState={{ disabled: retrying, busy: retrying }}
            disabled={retrying}
            onLayout={({ nativeEvent }) => {
              if (nativeEvent.layout.height > 0) setActionHeight(Math.ceil(nativeEvent.layout.height));
            }}
            onPress={() => {
              // Disabling a focused retry can blur it before the write finishes.
              // Keep focus on stable content for both success and another failure.
              returnFocus();
              onRetry();
            }}
            style={({ pressed }) => [styles.retry, pressed && { backgroundColor: color.panel }]}
          >
            <Text style={[typography.label, styles.retryLabel]}>{retrying ? 'saving' : 'retry'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss save error"
            onPress={() => {
              returnFocus();
              onDismiss(notice);
            }}
            style={({ pressed }) => [styles.close, pressed && { backgroundColor: color.panel }]}
          >
            <Icon name="close" tint={color.secondary} />
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notice: {
    maxHeight: '40%',
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
    marginHorizontal: space.page,
    marginTop: space.group,
    borderWidth: 1,
    borderColor: color.strongBorder,
    borderRadius: radius.lychee,
    backgroundColor: color.raised,
  },
  content: {
    padding: space.related,
    paddingLeft: space.group,
    alignItems: 'stretch',
    gap: space.tight,
  },
  error: { borderColor: `${color.primary}80` },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.tight },
  message: { minWidth: 0, maxWidth: '100%', color: color.text },
  focused: { outlineColor: color.primary, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
  retry: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.touch,
    paddingVertical: space.tight,
    paddingHorizontal: space.related,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.strongBorder,
    borderRadius: radius.grape,
  },
  retryLabel: { color: color.primary, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  close: {
    width: layout.touch,
    height: layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.grape,
  },
});
