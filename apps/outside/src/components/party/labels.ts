// Accessible names on the party screen that focus restoration looks up again on web. One
// constant per name keeps a relabelled control from silently breaking focus return.
export const PARTY_LABEL = {
  refresh: 'Refresh party and share Health steps',
  editProfile: 'edit party profile',
  loadMore: 'more bruhs',
  cancelMore: 'Cancel loading more bruhs',
  cancelRefresh: 'Cancel party refresh',
  tryAgain: 'try again',
  name: 'Your name',
} as const;

type PartyLabel = (typeof PARTY_LABEL)[keyof typeof PARTY_LABEL];

// The control in `container` with this accessible name; `extra` narrows it, e.g. ":not(...)".
export function byLabel(container: ParentNode, label: PartyLabel, extra = ''): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[aria-label="${label}"]${extra}`);
}
