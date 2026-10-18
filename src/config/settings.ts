// Player preferences chosen in the menu's Settings screen (not gameplay
// numbers - those live in tuning.ts). Saved in the browser between sessions.

export type CrosshairStyle = 'ring' | 'cross' | 'dot' | 'brackets' | 'laser' | 'none';
export type GunshotSound = 'recorded' | 'synth';
export type GoreLevel = 'off' | 'stylized' | 'full';

export interface Settings {
  crosshair: CrosshairStyle;
  crosshairColor: string;
  /** 0.75 small, 1 medium, 1.35 large. */
  crosshairSize: number;
  /** Show the red laser line (the red dot is shown either way, except with "none"). */
  laserBeam: boolean;
  gunshotSound: GunshotSound;
  /** Blood and dismemberment: none, blood only (no flying scraps), or everything. */
  gore: GoreLevel;
}

export const CROSSHAIR_STYLES: Array<{ id: CrosshairStyle; label: string; hint: string }> = [
  { id: 'ring', label: 'Focus ring', hint: 'A circle that shrinks as your aim steadies.' },
  { id: 'cross', label: 'Cross', hint: 'Four lines that close in as your aim steadies, with a centre dot.' },
  { id: 'brackets', label: 'Brackets', hint: 'Four corners that close in as your aim steadies.' },
  { id: 'dot', label: 'Dot', hint: 'A small fixed dot in the middle of the screen.' },
  { id: 'laser', label: 'Laser only', hint: 'Classic 2005 style: just the red laser dot on your target.' },
  { id: 'none', label: 'None', hint: 'No crosshair and no laser dot. For experts.' },
];

export const CROSSHAIR_COLORS: Array<{ id: string; label: string }> = [
  { id: '#ffffff', label: 'White' },
  { id: '#ff4a3d', label: 'Red' },
  { id: '#5dff6a', label: 'Green' },
  { id: '#ffd23f', label: 'Yellow' },
  { id: '#4fd8ff', label: 'Cyan' },
];

export const CROSSHAIR_SIZES: Array<{ id: number; label: string }> = [
  { id: 0.75, label: 'Small' },
  { id: 1, label: 'Medium' },
  { id: 1.35, label: 'Large' },
];

export const GORE_LEVELS: Array<{ id: GoreLevel; label: string; hint: string }> = [
  { id: 'full', label: 'Full', hint: 'Heads burst into pieces, limbs tear off, plenty of blood.' },
  { id: 'stylized', label: 'Stylized', hint: 'Heads burst and limbs tear off, but no flying scraps and less blood.' },
  { id: 'off', label: 'Off', hint: 'No blood and nothing comes off. Big hits still kill outright.' },
];

const DEFAULTS: Settings = {
  crosshair: 'ring',
  crosshairColor: '#ffffff',
  crosshairSize: 1,
  laserBeam: true,
  gunshotSound: 'recorded',
  gore: 'full',
};

const KEY = 'deadAcre.settings';

function load(): Settings {
  const s: Settings = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    if (CROSSHAIR_STYLES.some((c) => c.id === saved.crosshair)) s.crosshair = saved.crosshair!;
    if (CROSSHAIR_COLORS.some((c) => c.id === saved.crosshairColor)) s.crosshairColor = saved.crosshairColor!;
    if (CROSSHAIR_SIZES.some((c) => c.id === saved.crosshairSize)) s.crosshairSize = saved.crosshairSize!;
    if (typeof saved.laserBeam === 'boolean') s.laserBeam = saved.laserBeam;
    if (saved.gunshotSound === 'recorded' || saved.gunshotSound === 'synth') s.gunshotSound = saved.gunshotSound;
    if (GORE_LEVELS.some((g) => g.id === saved.gore)) s.gore = saved.gore!;
  } catch {
    // No saved settings (or the browser blocks storage): use the defaults.
  }
  return s;
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private window): settings last until the page closes.
  }
}

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}

export function goreLevel(): GoreLevel {
  return settings.gore;
}

/** How much blood to spray for the chosen gore level (1 = full). */
export function bloodScale(): number {
  return settings.gore === 'full' ? 1 : settings.gore === 'stylized' ? 0.6 : 0;
}
