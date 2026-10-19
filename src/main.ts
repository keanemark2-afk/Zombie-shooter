import './style.css';
import { Vector3 } from 'three';
import type { Zone } from './combat/damage';
import { settings } from './config/settings';
import { tuning, type Tuning } from './config/tuning';
import { Game } from './core/game';
import { installErrorOverlay, showError } from './debug/errorOverlay';
import type { GameMode } from './core/modes';
import type { EnemyKind } from './enemies/kinds';

declare global {
  interface Window {
    /** Hooks used by the automated browser test. */
    __deadAcre?: {
      ready: boolean;
      tuning: Tuning;
      frames: () => number;
      ticks: () => number;
      screenStats: () => { mean: number; spread: number };
      renderInfo: () => { calls: number; triangles: number; programs: number };
      start: (mode: GameMode) => void;
      state: () => ReturnType<Game['debugState']>;
      aimAt: (zone: Zone) => boolean;
      view: (from: [number, number, number] | null, to?: [number, number, number], keepControls?: boolean) => void;
      zombie: (kind: Parameters<Game['debugZombie']>[0], value?: number) => boolean;
      killAll: () => void;
      spawn: (kind: EnemyKind, distance: number, aware: boolean, side?: number) => number;
      cheat: (kind: Parameters<Game['debugCheat']>[0], value?: number, key?: string) => void;
      ui: (which: 'case' | 'trader' | 'close') => void;
      difficulty: (id: 'easy' | 'normal' | 'hard' | 'pro') => void;
    };
  }
}

installErrorOverlay();

function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

const loading = document.getElementById('loading');
const container = document.getElementById('app')!;
// "?autotest" in the address: the automated test drives the game without capturing the mouse.
const autotest = new URLSearchParams(location.search).has('autotest');

if (!webglAvailable()) {
  loading?.remove();
  showError(
    "Your browser couldn't start 3D graphics",
    'Dead Acre needs WebGL 2.\n\n' +
      'Try this:\n' +
      '1. Use Google Chrome or Microsoft Edge.\n' +
      '2. In the browser settings, search for "hardware acceleration" and make sure it is switched ON.\n' +
      '3. Restart the browser and double-click "Play Game.bat" again.',
  );
} else {
  const game = new Game(container, autotest);
  game.start();
  if (autotest) (window as unknown as { __game: Game }).__game = game;
  loading?.remove();
  window.__deadAcre = {
    ready: true,
    tuning,
    frames: () => game.frameCount,
    ticks: () => game.tickCount,
    screenStats: () => game.debugScreenStats(),
    renderInfo: () => ({
      calls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      programs: game.renderer.info.programs?.length ?? 0,
    }),
    start: (mode) => game.startMode(mode),
    state: () => game.debugState(),
    aimAt: (zone) => game.debugAimAt(zone),
    view: (from, to, keepControls) => game.debugView(from ? new Vector3(...from) : null, to ? new Vector3(...to) : null, keepControls),
    zombie: (kind, value) => game.debugZombie(kind, value),
    killAll: () => game.debugKillAll(),
    spawn: (kind, distance, aware, side) => game.debugSpawn(kind, distance, aware, side),
    cheat: (kind, value, key) => game.debugCheat(kind, value, key),
    ui: (which) => game.debugUi(which),
    difficulty: (id) => {
      settings.difficulty = id;
    },
  };
}
