export const ADVENTURE_TABS = [
  { route: 'index', label: 'world', name: 'World', art: 'world' },
  { route: 'map', label: 'map', name: 'World map', art: 'map' },
  { route: 'skills', label: 'skills', name: 'Skills', art: 'skills' },
  { route: 'bag', label: 'bag', name: 'Bag, gear and bank', art: 'bag' },
  { route: 'quests', label: 'quests', name: 'Quests', art: 'quests' },
] as const;

export function adventureTab(name: string): (typeof ADVENTURE_TABS)[number] | undefined {
  return ADVENTURE_TABS.find((tab) => tab.route === name);
}

export function tabId(name: string): string {
  return `outside-tab-${name}`;
}

export function panelId(name: string): string {
  return `outside-panel-${name}`;
}
