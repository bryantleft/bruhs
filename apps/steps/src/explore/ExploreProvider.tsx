import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { locationPorts } from './location';
import { createRecorder, EMPTY_EXPLORER, type ExplorerState, type Recorder } from './recorder';

const WALK_KEY = 'bruhs-outside-walk-v1';
const ExploreContext = createContext<Readonly<{ state: ExplorerState; recorder: Recorder | null }> | null>(
  null,
);

export function ExploreProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [state, setState] = useState(EMPTY_EXPLORER);
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  useEffect(() => {
    const current = createRecorder(
      {
        read: () => AsyncStorage.getItem(WALK_KEY),
        write: (raw) => AsyncStorage.setItem(WALK_KEY, raw),
        remove: () => AsyncStorage.removeItem(WALK_KEY),
        ...locationPorts,
        now: Date.now,
      },
      setState,
    );
    setRecorder(current);
    void current.load();
    // Foreground recording is explicit: never connect across a background gap.
    // iOS permission dialogs can be "inactive", so only background stops a request.
    const listener = AppState.addEventListener('change', (value) => {
      if (value === 'background') current.pause();
    });
    return () => {
      listener.remove();
      current.dispose();
    };
  }, []);
  return <ExploreContext.Provider value={{ state, recorder }}>{children}</ExploreContext.Provider>;
}

export function useExplore(): Readonly<{ state: ExplorerState; recorder: Recorder | null }> {
  const value = useContext(ExploreContext);
  if (!value) throw new Error('useExplore must be called inside ExploreProvider.');
  return value;
}
