import { ACESFilmicToneMapping, LineSegments, PCFShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { tuning } from '../config/tuning';
import { FpsCounter } from '../debug/fpsCounter';
import { showError } from '../debug/errorOverlay';
import { HelpOverlay } from '../debug/helpOverlay';
import { TuningPanel } from '../debug/tuningPanel';
import { PostFx } from '../render/postFx';
import { Arena, terrainHeight } from '../world/arena';
import { colliderOutlines } from '../world/colliders';
import { FlyCamera } from './flyCamera';
import { FixedStepClock } from './loop';
import { Input } from './input';

/** Owns the renderer, the world and the main loop. */
export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly arena: Arena;
  readonly tuningPanel: TuningPanel;
  private readonly post: PostFx;
  private readonly input: Input;
  private readonly flyCamera: FlyCamera;
  private readonly clock = new FixedStepClock();
  private readonly fps: FpsCounter;
  private readonly help: HelpOverlay;
  private colliderLines: LineSegments | null = null;
  private lastFrameTime = 0;
  private pixelRatio = 0;
  private readonly reportedErrors = new Set<string>();

  /** Seconds of game time that have passed (stops when paused, later). */
  gameTime = 0;
  frameCount = 0;
  tickCount = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = tuning.graphics.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.tabIndex = 0;
    // Count draw calls across the whole frame (the screen effects draw several times).
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(tuning.flyCamera.fov, 1, 0.1, 1200);

    this.arena = new Arena(this.scene);
    this.input = new Input(this.renderer.domElement);
    this.flyCamera = new FlyCamera(this.camera, this.input, terrainHeight);
    this.flyCamera.lookFrom(new Vector3(15, 5.5, 27), new Vector3(-2, 1.2, -2));
    this.post = new PostFx(this.renderer, this.scene, this.camera);
    this.fps = new FpsCounter(this.renderer);
    this.tuningPanel = new TuningPanel(tuning);
    this.tuningPanel.onChange((path) => this.onTuningChanged(path));
    this.help = new HelpOverlay('DEAD ACRE  -  Phase 0: empty arena', [
      ['Hold mouse + move', 'Look around'],
      ['W A S D', 'Fly'],
      ['Space / E', 'Fly up'],
      ['Q / C', 'Fly down'],
      ['Shift', 'Fly faster'],
      ['Arrow keys', 'Look around (keyboard)'],
      ['F1', 'Tuning panel'],
      ['F3', 'FPS counter'],
      ['H', 'Hide / show this help'],
    ]);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.domElement.focus();
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 1 / 60;
    this.lastFrameTime = now;
    try {
      this.renderer.info.reset();
      this.handleGlobalKeys();
      const step = 1 / tuning.simulation.tickRate;
      const steps = this.clock.advance(dt, step, tuning.simulation.maxFrameTime);
      for (let i = 0; i < steps; i++) this.tick(step);
      this.flyCamera.update(Math.min(dt, 0.1));
      this.arena.update(this.gameTime, this.camera);
      this.applyGraphicsTuning();
      this.post.render(Math.min(dt, 0.1));
      this.fps.frame(dt);
      this.frameCount++;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (!this.reportedErrors.has(e.message)) {
        this.reportedErrors.add(e.message);
        console.error(e);
        showError('Something went wrong', `${e.message}\n${e.stack ?? ''}`);
      }
    } finally {
      this.input.endFrame();
    }
  };

  /** One fixed slice of game-world time. Enemies, bullets and timers will live here. */
  private tick(dt: number): void {
    this.gameTime += dt;
    this.tickCount++;
  }

  private handleGlobalKeys(): void {
    if (this.input.wasPressed('F1')) this.tuningPanel.toggle();
    if (this.input.wasPressed('F3')) this.fps.toggle();
    if (this.input.wasPressed('KeyH')) this.help.toggle();
  }

  private onTuningChanged(path: string): void {
    if (path === 'graphics.shadows') {
      this.renderer.shadowMap.enabled = tuning.graphics.shadows;
      this.arena.sun.castShadow = tuning.graphics.shadows;
      // Every material has to be rebuilt to switch shadows on or off.
      this.scene.traverse((obj) => {
        const mat = (obj as { material?: { needsUpdate: boolean } | Array<{ needsUpdate: boolean }> }).material;
        if (Array.isArray(mat)) mat.forEach((m) => (m.needsUpdate = true));
        else if (mat) mat.needsUpdate = true;
      });
    }
    if (path === 'graphics.shadowMapSize') {
      const size = 2 ** Math.round(Math.log2(Math.max(256, tuning.graphics.shadowMapSize)));
      const shadow = this.arena.sun.shadow;
      shadow.mapSize.set(size, size);
      shadow.map?.dispose();
      shadow.map = null;
    }
  }

  private applyGraphicsTuning(): void {
    this.renderer.toneMappingExposure = tuning.atmosphere.exposure;
    const ratio = Math.min(window.devicePixelRatio || 1, tuning.graphics.maxPixelRatio);
    if (ratio !== this.pixelRatio) this.resize();

    if (tuning.debug.showColliders && !this.colliderLines) {
      this.colliderLines = colliderOutlines(this.arena.colliders);
      this.scene.add(this.colliderLines);
    }
    if (this.colliderLines) this.colliderLines.visible = tuning.debug.showColliders;
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, tuning.graphics.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.post.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** For automated tests and screenshots: puts the camera somewhere specific. */
  debugSetView(position: Vector3, target: Vector3): void {
    this.flyCamera.lookFrom(position, target);
  }

  /**
   * For automated tests: draws a frame and measures how bright and how varied
   * the picture is, so a test can tell a real scene from a black screen.
   */
  debugScreenStats(): { mean: number; spread: number } {
    this.post.render(0);
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 36;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.renderer.domElement, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += l;
      sumSq += l * l;
    }
    const mean = sum / n;
    return { mean, spread: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  }
}
