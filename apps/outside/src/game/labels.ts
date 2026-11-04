export function stepUnit(count: number): 'step' | 'steps' {
  return count === 1 ? 'step' : 'steps';
}

export function formatSteps(count: number): string {
  return `${count.toLocaleString()} ${stepUnit(count)}`;
}
