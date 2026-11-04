import { z } from "zod";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { defaultModel, findModel } from "@/lib/data";
import { type Keys, type Model, Provider } from "@/lib/types";

type InitialStore = {
  visible: boolean;
  setVisible: (visible: boolean) => void;
};

export const useInitialStore = create<InitialStore>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
}));

export type Coordinates = {
  x: number;
  y: number;
};

type BruhStore = {
  /** Force the bruh to the centre (used before leaving the page). */
  centered: boolean;
  /** Where the bruh looks, in viewport pixels: the pointer or the selected message. */
  focusPosition: Coordinates;
  setCentered: (centered: boolean) => void;
  setFocusPosition: (coordinates: Coordinates) => void;
};

export const useBruhStore = create<BruhStore>((set) => ({
  centered: false,
  focusPosition: { x: 0, y: 0 },
  setCentered: (centered) => set({ centered }),
  setFocusPosition: (coordinates) => set({ focusPosition: coordinates }),
}));

type LLMState = {
  keys: Keys;
  modelId: string;
  /** Keep keys (and settings) in localStorage; otherwise only for this tab session. */
  rememberKeys: boolean;
};

type LLMStore = LLMState & {
  addKey: (provider: Provider, key: string) => void;
  removeKey: (provider: Provider) => void;
  setModel: (model: Model) => void;
  setRememberKeys: (remember: boolean) => void;
};

const browserStorage = (
  kind: "localStorage" | "sessionStorage",
): Storage | null => (typeof window === "undefined" ? null : window[kind]);

/**
 * Writes the store to localStorage when `rememberKeys` is on and to sessionStorage
 * when it's off, removing the other copy, so a session-only key never lingers on disk.
 */
const keyAwareStorage: StateStorage = {
  getItem: (name) =>
    browserStorage("sessionStorage")?.getItem(name) ??
    browserStorage("localStorage")?.getItem(name) ??
    null,
  setItem: (name, value) => {
    let remember = true;
    try {
      remember = JSON.parse(value)?.state?.rememberKeys !== false;
    } catch {
      // Unparseable: keep the default (remember).
    }
    const keep = browserStorage(remember ? "localStorage" : "sessionStorage");
    const drop = browserStorage(remember ? "sessionStorage" : "localStorage");
    keep?.setItem(name, value);
    drop?.removeItem(name);
  },
  removeItem: (name) => {
    browserStorage("localStorage")?.removeItem(name);
    browserStorage("sessionStorage")?.removeItem(name);
  },
};

const KeysSchema = z.partialRecord(z.enum(Provider), z.string());

/** Version 0 stored `{ keys: Keys | null, model: Model }`. */
const LegacyStateSchema = z.object({
  keys: KeysSchema.nullable().optional(),
  model: z.object({ id: z.string() }).optional(),
});

const StateSchema = z.object({
  keys: KeysSchema,
  modelId: z.string(),
  rememberKeys: z.boolean(),
});

const initialState: LLMState = {
  keys: {},
  modelId: defaultModel.id,
  rememberKeys: true,
};

export const useLLMStore = create<LLMStore>()(
  persist(
    (set) => ({
      ...initialState,
      addKey: (provider, key) =>
        set(({ keys }) => ({ keys: { ...keys, [provider]: key } })),
      removeKey: (provider) =>
        set(({ keys }) => {
          const { [provider]: _removed, ...rest } = keys;
          return { keys: rest };
        }),
      setModel: (model) => set({ modelId: model.id }),
      setRememberKeys: (rememberKeys) => set({ rememberKeys }),
    }),
    {
      name: "llm",
      version: 1,
      storage: createJSONStorage(() => keyAwareStorage),
      partialize: ({ keys, modelId, rememberKeys }): LLMState => ({
        keys,
        modelId,
        rememberKeys,
      }),
      migrate: (persisted, version): LLMState => {
        if (version !== 0) return initialState;
        const legacy = LegacyStateSchema.safeParse(persisted);
        if (!legacy.success) return initialState;
        return {
          keys: legacy.data.keys ?? {},
          modelId: legacy.data.model?.id ?? defaultModel.id,
          rememberKeys: true,
        };
      },
      // Saved data is external input: keep it only if it matches the current shape.
      merge: (persisted, current) => {
        const saved = StateSchema.safeParse(persisted);
        return saved.success ? { ...current, ...saved.data } : current;
      },
    },
  ),
);

/** The selected model; falls back to the default if a saved ID is no longer offered. */
export function useModel(): Model {
  const modelId = useLLMStore((s) => s.modelId);
  return findModel(modelId) ?? defaultModel;
}

type CommandStore = {
  commandBarOpen: boolean;
  setCommandBarOpen: (open: boolean) => void;
};

export const useCommandStore = create<CommandStore>((set) => ({
  commandBarOpen: false,
  setCommandBarOpen: (open) => set({ commandBarOpen: open }),
}));
