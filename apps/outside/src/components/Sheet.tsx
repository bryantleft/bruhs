import type { PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bevel } from '../pixel/chrome';
import { color, font, layout, shadow, space } from '../theme/theme';
import { Icon } from './Icon';

// A bottom sheet in the pixel chrome: title bar, close button, scrollable body, and an optional
// footer pinned under the body so the main action stays in reach on short screens.
export function Sheet({
  title,
  titleTint = color.gold,
  onClose,
  footer,
  children,
}: PropsWithChildren<
  Readonly<{ title: string; titleTint?: string; onClose: () => void; footer?: React.ReactNode }>
>): React.JSX.Element {
  // Inside a Modal, iOS does not hand SafeAreaView its insets, so read them from the app's
  // provider and pad the sheet itself: its panel colour runs under the home indicator.
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.frame}>
          <View
            accessibilityViewIsModal
            style={[styles.sheet, bevel('panel'), { paddingBottom: insets.bottom }]}
          >
            <View style={styles.header}>
              <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: titleTint }]}>
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.close, bevel('panel', pressed)]}
              >
                <Icon name="close" tint={color.text} size={16} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,8,6,0.7)' },
  frame: { maxHeight: '88%', width: '100%', maxWidth: 480, alignSelf: 'center' },
  sheet: { borderColor: color.ink, borderWidth: layout.border, flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.related,
    paddingHorizontal: space.group,
    paddingTop: space.related,
    paddingBottom: space.tight,
    borderBottomWidth: layout.border,
    borderBottomColor: color.ink,
  },
  title: { flex: 1, fontFamily: font.display, fontSize: 20, lineHeight: 25, ...shadow },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.group, gap: space.group },
  footer: {
    paddingHorizontal: space.group,
    paddingVertical: space.related,
    borderTopWidth: layout.border,
    borderTopColor: color.ink,
  },
});
