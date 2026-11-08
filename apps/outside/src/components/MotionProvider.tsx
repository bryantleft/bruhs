import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { easeOut, motion } from '../theme/theme';

const MotionContext = createContext(true);

export function MotionProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduced(enabled);
      })
      .catch((error: unknown) =>
        console.warn('Motion preference could not be read; using reduced motion.', error),
      );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}

export function useReducedMotion(): boolean {
  return useContext(MotionContext);
}

// 0 to 1 as something appears, over the standard 200 ms with the ease-out curve. Starts again
// when `key` changes, and is 1 at once under reduced motion.
export function useEntrance(key?: unknown): Animated.Value {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` restarts the entrance on purpose.
  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const animation = Animated.timing(value, {
      toValue: 1,
      duration: motion.standard,
      easing: easeOut,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [key, reduced, value]);
  return value;
}
