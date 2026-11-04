import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

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
