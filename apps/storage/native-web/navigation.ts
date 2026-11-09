import { retraceFolders } from "../src/lib/folder-trail.ts";
import type { DirNode } from "../src/lib/types.ts";

/**
 * Where the map is, and where Back and Forward go. The page keeps this history, and Pith's path bar and Go menu
 * move it through `pithCommand`. Each map of another folder starts it over: Pith keeps no map but the live one, so
 * going back to another folder's map would mean scanning it again.
 */
export interface Navigation {
  /** The open folders, from the map's root down to the one on the map. Empty without a map. */
  readonly trail: readonly DirNode[];
  /** The open folders' paths. They outlast an empty payload, so the next map of the same folder opens in place. */
  readonly paths: readonly string[];
  /**
   * The folders down to one asked for that the map doesn't hold, from its root: the live map leaves out small folders
   * far from the open one. The next map that holds it opens it, until the person goes somewhere else.
   */
  readonly wanted: readonly string[] | null;
  /** Where Back goes, the nearest last. */
  readonly back: readonly string[];
  /** Where Forward goes, the nearest last. */
  readonly forward: readonly string[];
}

export type NavigationAction =
  /** A map arrived from Pith, or none while Pith makes another. */
  | { type: "received"; root: DirNode | null }
  /**
   * Open a folder of the map. `from` is where the map was when the person asked: the map opens a folder several
   * levels down one level at a time, all from the same place, which is one step back.
   */
  | { type: "open"; path: string; from?: string }
  | { type: "up" }
  | { type: "back" }
  | { type: "forward" };

export const NO_MAP: Navigation = {
  trail: [],
  paths: [],
  wanted: null,
  back: [],
  forward: [],
};

/** Each folder from `root` down to `path`, or null when `path` isn't a plain path inside `root`. */
export function folderChain(root: string, path: string): string[] | null {
  if (path === root) return [root];
  const inside = root === "/" ? "/" : `${root}/`;
  if (!path.startsWith(inside)) return null;
  const chain = [root];
  let folder = root === "/" ? "" : root;
  for (const name of path.slice(inside.length).split("/")) {
    if (!name) return null;
    folder = `${folder}/${name}`;
    chain.push(folder);
  }
  return chain;
}

export function navigate(
  state: Navigation,
  action: NavigationAction,
): Navigation {
  switch (action.type) {
    case "received":
      return received(state, action.root);
    case "open": {
      const root = state.trail[0];
      const chain = root ? folderChain(root.path, action.path) : null;
      return chain ? step(state, chain, action.from) : state;
    }
    case "up":
      return state.trail.length > 1
        ? step(state, state.paths.slice(0, -1))
        : state;
    case "back":
    case "forward":
      return travel(state, action.type);
  }
}

/** The map shows the folders of `chain` it holds, and wants the rest until a map holds them. */
function show(
  root: DirNode,
  chain: readonly string[],
): Pick<Navigation, "trail" | "paths" | "wanted"> {
  const trail = retraceFolders(root, chain);
  return {
    trail,
    paths: trail.map((folder) => folder.path),
    wanted: trail.length < chain.length ? chain : null,
  };
}

/**
 * Where the person is: the folder the map shows, or the one they went back or forward to while the map still lacks
 * it, which the map shows the folder above meanwhile.
 */
function placeOf(state: Navigation): string | undefined {
  return state.wanted?.at(-1) ?? state.trail.at(-1)?.path;
}

/** The person goes to the end of `chain`: where they were becomes a step back, and the way forward goes. */
function step(
  state: Navigation,
  chain: readonly string[],
  from?: string,
): Navigation {
  const root = state.trail[0];
  const place = placeOf(state);
  if (!root || place === undefined || chain.at(-1) === place) return state;
  // A later level of the same opening finds the map already moved from where it was when the person asked.
  const leaving = from === undefined || from === state.trail.at(-1)?.path;
  return {
    ...show(root, chain),
    back: leaving ? [...state.back, place] : state.back,
    forward: [],
  };
}

function travel(state: Navigation, direction: "back" | "forward"): Navigation {
  const root = state.trail[0];
  const place = placeOf(state);
  const steps = direction === "back" ? state.back : state.forward;
  const target = steps.at(-1);
  const chain =
    target === undefined || !root ? null : folderChain(root.path, target);
  if (!root || place === undefined || !chain) return state;
  const rest = steps.slice(0, -1);
  const other = [...(direction === "back" ? state.forward : state.back), place];
  return {
    ...show(root, chain),
    back: direction === "back" ? rest : other,
    forward: direction === "back" ? other : rest,
  };
}

function received(state: Navigation, root: DirNode | null): Navigation {
  if (!root) return state.trail.length === 0 ? state : { ...state, trail: [] };
  // Another folder's map, or the first.
  if (state.paths[0] !== root.path) {
    return { ...NO_MAP, trail: [root], paths: [root.path] };
  }
  const shown = show(root, state.wanted ?? state.paths);
  // While a folder is wanted the person is there, whatever this map holds of it: the steps stay as they are.
  if (state.wanted) {
    return {
      ...shown,
      // Wanted only while the map lacks it: a map that doesn't hold it yet keeps the request.
      wanted: shown.wanted ? state.wanted : null,
      back: state.back,
      forward: state.forward,
    };
  }
  // A folder that went away moves the map up, though the person went nowhere: a step that leads back to where the
  // map now is would go nowhere either.
  const here = shown.trail.at(-1)?.path;
  const skip = (steps: readonly string[]) =>
    steps.at(-1) === here ? steps.slice(0, -1) : steps;
  return { ...shown, back: skip(state.back), forward: skip(state.forward) };
}
