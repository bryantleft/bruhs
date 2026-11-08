import { useIsFocused, useRoute } from 'expo-router';
import {
  type ComponentPropsWithRef,
  type ComponentRef,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGameFeedback } from '../game/GameProvider';
import { adventureTab, panelId, tabId } from '../navigation/tabs';
import { bevel } from '../pixel/chrome';
import { palette } from '../theme/palette';
import { color, font, layout, motion, shadow, space, typography } from '../theme/theme';
import { GameNotice } from './GameNotice';
import { Icon, type IconName } from './Icon';
import { keepFocusVisibleOnFocus, keepFocusVisibleOnKey } from './keepFocusVisible';
import { useReducedMotion } from './MotionProvider';
import { useAdaptiveFooter } from './useAdaptiveFooter';

export function Copy({
  variant = 'body',
  style,
  ...props
}: ComponentPropsWithRef<typeof Text> &
  Readonly<{ variant?: keyof typeof typography | 'inherit' }>): React.JSX.Element {
  return (
    <Text
      {...props}
      accessibilityRole={
        props.accessibilityRole ?? (variant === 'title' || variant === 'heading' ? 'header' : undefined)
      }
      aria-level={variant === 'title' ? 1 : variant === 'heading' ? 2 : undefined}
      style={[variant === 'inherit' ? undefined : typography[variant], style]}
    />
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  descriptionId,
  buttonRef,
}: Readonly<{
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'outline' | 'ghost';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  descriptionId?: string;
  buttonRef?: Ref<ComponentRef<typeof Pressable>>;
}>): React.JSX.Element {
  // Light text on the gold fill is 2.9:1 and fails WCAG AA; ink is 6.3:1 (as on outside.bruhs.app).
  const tint = variant === 'primary' ? color.ink : color.text;
  const descriptionProps =
    Platform.OS === 'web' ? { 'aria-describedby': descriptionId } : { accessibilityHint };
  return (
    <Pressable
      {...descriptionProps}
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' ? styles.ghost : bevel(variant === 'primary' ? 'gold' : 'panel', pressed),
        pressed && styles.pressed,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Copy style={[styles.buttonText, variant === 'primary' && styles.primaryText, { color: tint }]}>
        {label}
      </Copy>
      {icon ? <Icon name={icon} tint={tint} /> : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  loading = false,
}: Readonly<{
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}>): React.JSX.Element {
  const reduced = useReducedMotion();
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading || undefined }}
      aria-busy={loading || undefined}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        bevel('panel', pressed),
        blocked && !loading && { opacity: 0.4 },
      ]}
    >
      {loading ? (
        <View aria-hidden accessible={false} pointerEvents="none">
          {reduced ? (
            <Icon name="loading" tint={color.primary} />
          ) : (
            <ActivityIndicator size="small" color={color.primary} accessible={false} />
          )}
        </View>
      ) : (
        <Icon name={icon} tint={color.secondary} />
      )}
    </Pressable>
  );
}

export function Progress({
  value,
  tint = color.success,
  label,
  decorative = false,
}: Readonly<{ value: number; tint?: string; label: string; decorative?: boolean }>): React.JSX.Element {
  const reduced = useReducedMotion();
  const normalized = Math.max(0, Math.min(1, value));
  // Reserve 100% for a completed target, even when rounding its final steps.
  const percentage = normalized === 1 ? 100 : Math.min(99, Math.round(normalized * 100));
  const progress = useRef(new Animated.Value(normalized)).current;
  useEffect(() => {
    if (reduced) {
      progress.setValue(normalized);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: normalized,
      duration: motion.standard,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [normalized, progress, reduced]);
  return (
    <View
      accessible={!decorative}
      aria-hidden={decorative}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      style={styles.track}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: tint,
            transform: [{ scaleX: progress }],
            transformOrigin: 'left center',
          },
        ]}
      />
    </View>
  );
}

export function Screen({
  children,
  style,
  footer,
  bottomSafeArea = false,
  rootRef,
  scrollRef,
  onScroll,
  onScrollBeginDrag,
  keyboardShouldPersistTaps,
  automaticallyAdjustKeyboardInsets,
  onRefresh,
  refreshing = false,
}: PropsWithChildren<
  Readonly<{
    style?: ViewStyle;
    footer?: ReactNode;
    bottomSafeArea?: boolean;
    rootRef?: RefObject<ComponentRef<typeof View> | null>;
    scrollRef?: RefObject<ComponentRef<typeof ScrollView> | null>;
    onScroll?: ComponentPropsWithRef<typeof ScrollView>['onScroll'];
    onScrollBeginDrag?: ComponentPropsWithRef<typeof ScrollView>['onScrollBeginDrag'];
    keyboardShouldPersistTaps?: ComponentPropsWithRef<typeof ScrollView>['keyboardShouldPersistTaps'];
    automaticallyAdjustKeyboardInsets?: ComponentPropsWithRef<
      typeof ScrollView
    >['automaticallyAdjustKeyboardInsets'];
    // Pull down to refresh, on phones. Web has no pull gesture, so it gets nothing.
    onRefresh?: () => void;
    refreshing?: boolean;
  }>
>): React.JSX.Element {
  const focused = useIsFocused();
  const route = useRoute();
  const { notice, reward, dismissNotice, retrySave, retryingSave } = useGameFeedback();
  const localScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const scroll = scrollRef ?? localScroll;
  const { footerInFlow, footerRef, onBodyLayout, onFooterLayout } = useAdaptiveFooter(
    scroll,
    focused && !reward,
    reward !== null,
  );
  const returnToContent = useCallback(() => {
    if (Platform.OS === 'web') scroll.current?.focus();
  }, [scroll]);
  // Retained routes can remain mounted during a transition. On the web they
  // must reject keyboard focus, including the modal's automatic opener restore.
  const webFocus = Platform.OS === 'web' ? { inert: !focused || reward !== null } : {};
  const webContent = Platform.OS === 'web' ? { dataSet: { focusContent: 'true' } } : {};
  const webPanel =
    Platform.OS === 'web' && adventureTab(route.name)
      ? { id: panelId(route.name), role: 'tabpanel' as const, 'aria-labelledby': tabId(route.name) }
      : {};
  // React Native values <=16 ms disable throttling; observe frames while a handler is active.
  const scrollEventThrottle = onScroll ? 16 : undefined;
  const footerView = footer ? (
    <View
      ref={footerRef}
      onLayout={onFooterLayout}
      style={[styles.footer, footerInFlow && styles.inFlowFooter]}
    >
      {footer}
    </View>
  ) : null;
  return (
    <SafeAreaView
      ref={rootRef}
      {...webFocus}
      {...webPanel}
      style={styles.screen}
      edges={bottomSafeArea ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']}
    >
      {notice && focused && !reward ? (
        <GameNotice
          notice={notice}
          onDismiss={dismissNotice}
          returnFocus={returnToContent}
          onRetry={retrySave}
          retrying={retryingSave}
        />
      ) : null}
      <View style={styles.body} onLayout={onBodyLayout}>
        <ScrollView
          {...webContent}
          ref={scroll}
          tabIndex={Platform.OS === 'web' ? -1 : undefined}
          role={Platform.OS === 'web' ? 'group' : undefined}
          accessibilityLabel="Your adventure"
          onScroll={onScroll}
          onScrollBeginDrag={onScrollBeginDrag}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
          scrollEventThrottle={scrollEventThrottle}
          onLayout={() => keepFocusVisibleOnFocus(scroll.current?.getNativeScrollRef())}
          onFocus={
            Platform.OS === 'web'
              ? () => keepFocusVisibleOnFocus(scroll.current?.getNativeScrollRef())
              : undefined
          }
          onKeyDownCapture={
            Platform.OS === 'web'
              ? (event) => keepFocusVisibleOnKey(scroll.current?.getNativeScrollRef(), event.nativeEvent)
              : undefined
          }
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh && Platform.OS !== 'web' ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.gold} />
            ) : undefined
          }
          contentContainerStyle={[styles.content, style]}
        >
          {children}
          {footerInFlow ? footerView : null}
        </ScrollView>
        {footerInFlow ? null : footerView}
      </View>
    </SafeAreaView>
  );
}

export function SectionTitle({
  title,
  aside,
}: Readonly<{ title: string; aside?: string }>): React.JSX.Element {
  return (
    <View style={styles.sectionTitle}>
      <Copy variant="heading" style={styles.sectionText}>
        {title}
      </Copy>
      {aside ? (
        <Copy variant="label" style={styles.sectionText}>
          {aside}
        </Copy>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  body: { flex: 1, minHeight: 0 },
  content: { padding: space.page, paddingBottom: space.section, gap: space.section },
  footer: {
    paddingHorizontal: space.page,
    paddingTop: space.related,
    paddingBottom: space.group,
    backgroundColor: color.panel,
    borderTopWidth: layout.border,
    borderColor: color.ink,
  },
  inFlowFooter: { marginHorizontal: -space.page, marginBottom: -space.section },
  button: {
    minHeight: layout.button,
    paddingHorizontal: 16,
    paddingVertical: 10,
    outlineColor: color.ink,
    outlineWidth: 2,
    outlineStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pressed: { paddingTop: 12, paddingBottom: 8 },
  ghost: { backgroundColor: 'transparent', borderWidth: layout.border, borderColor: 'transparent' },
  buttonText: {
    fontFamily: font.bold,
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
    ...shadow,
  },
  // Ink text takes a light highlight instead of the ink drop shadow.
  primaryText: { textShadowColor: palette['durian-300'] },
  iconButton: {
    width: layout.touch,
    height: layout.touch,
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    height: 14,
    // Neutral like the pixel bars: an empty track is just empty, not a warning.
    backgroundColor: palette['longan-900'],
    borderWidth: layout.border,
    borderColor: color.ink,
    overflow: 'hidden',
  },
  fill: { height: '100%', width: '100%' },
  sectionTitle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.tight,
  },
  sectionText: { maxWidth: '100%', flexShrink: 1 },
});
