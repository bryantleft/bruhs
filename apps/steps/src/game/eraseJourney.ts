import type { ClearWalkResult, Recorder } from '../explore/recorder.ts';

export async function eraseJourney({
  stopSteps,
  clearWalk,
  resetGame,
}: Readonly<{
  stopSteps: () => void;
  clearWalk: Recorder['clear'];
  resetGame: () => void;
}>): Promise<ClearWalkResult> {
  stopSteps();
  const result = await clearWalk();
  if (result.ok) resetGame();
  return result;
}
