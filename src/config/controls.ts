// Default control layout. Each action lists the keyboard keys, mouse button and
// gamepad button that trigger it. Kept as data so a remapping screen can edit it later.

/** Standard gamepad button numbers (same order for PlayStation and Xbox pads). */
export const PAD = {
  south: 0, // PlayStation Cross / Xbox A
  east: 1, // Circle / B
  west: 2, // Square / X
  north: 3, // Triangle / Y
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  select: 8, // Create (Share) / View
  start: 9, // Options / Menu
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export type Action = 'aim' | 'fire' | 'reload' | 'sprint' | 'melee' | 'knife' | 'pause' | 'nextWeapon' | 'prevWeapon' | 'heal' | 'grenade' | 'nextGrenade' | 'caseOpen' | 'ready' | 'interact';

export interface Binding {
  keys: string[];
  mouse?: number;
  pad?: number;
}

export const bindings: Record<Action, Binding> = {
  aim: { keys: [], mouse: 2, pad: PAD.l2 },
  fire: { keys: [], mouse: 0, pad: PAD.r2 },
  reload: { keys: ['KeyR'], pad: PAD.west },
  sprint: { keys: ['ShiftLeft', 'ShiftRight'], pad: PAD.south },
  melee: { keys: ['KeyF'], pad: PAD.south },
  knife: { keys: ['KeyV'], pad: PAD.r1 },
  pause: { keys: [], pad: PAD.start },
  nextWeapon: { keys: [], pad: PAD.right },
  prevWeapon: { keys: [], pad: PAD.left },
  heal: { keys: ['KeyH'], pad: PAD.north },
  grenade: { keys: ['KeyG'], pad: PAD.l1 },
  nextGrenade: { keys: ['KeyB'], pad: PAD.up },
  caseOpen: { keys: ['Tab'], pad: PAD.select },
  ready: { keys: ['Enter'], pad: PAD.south },
  interact: { keys: ['KeyE'], pad: PAD.south },
};

/** Keys 1-9 pick a weapon quick-slot directly. */
export const slotKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

export const moveKeys = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

export type PadType = 'playstation' | 'xbox';

const PS_NAMES: Record<number, string> = {
  0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D-pad up', 13: 'D-pad down', 14: 'D-pad left', 15: 'D-pad right',
};
const XBOX_NAMES: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 12: 'D-pad up', 13: 'D-pad down', 14: 'D-pad left', 15: 'D-pad right',
};

/** On-screen name of a gamepad button, e.g. "R2" or "□" on PlayStation, "RT" or "X" on Xbox. */
export function padButtonName(button: number, type: PadType): string {
  return (type === 'playstation' ? PS_NAMES : XBOX_NAMES)[button] ?? `Button ${button}`;
}

/** Works out the controller brand from the name the browser reports. */
export function detectPadType(id: string): PadType {
  if (/054c|dualshock|dualsense|playstation|wireless controller/i.test(id)) return 'playstation';
  return 'xbox';
}
