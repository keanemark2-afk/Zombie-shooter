import './style.css';
import { Vector3 } from 'three';
import { Game } from './core/game';
import { tuning, type Tuning } from './config/tuning';
import { installErrorOverlay, showError } from './debug/errorOverlay';

declare global {
  interface Window {
    /** Hooks used by the automated browser test. */
    __deadAcre?: {
      ready: boolean;
      tuning: Tuning;
      frames: () => number;
      ticks: () => number;
      screenStats: () => { mean: number; spread: number };
      setView: (from: [number, number, number], to: [number, number, number]) => void;
      cameraPosition: () => [number, number, number];
      renderInfo: () => { calls: number; triangles: number; programs: number };
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
  const game = new Game(container);
  game.start();
  loading?.remove();
  window.__deadAcre = {
    ready: true,
    tuning,
    frames: () => game.frameCount,
    ticks: () => game.tickCount,
    screenStats: () => game.debugScreenStats(),
    setView: (from, to) => game.debugSetView(new Vector3(...from), new Vector3(...to)),
    cameraPosition: () => game.camera.position.toArray() as [number, number, number],
    renderInfo: () => ({
      calls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      programs: game.renderer.info.programs?.length ?? 0,
    }),
  };
}
