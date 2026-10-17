import { HalfFloatType, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { tuning } from '../config/tuning';

/** Final colour grade: desaturate, add contrast, darken the corners and add film grain. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
    contrast: { value: 1 },
    vignette: { value: 0 },
    grain: { value: 0 },
    time: { value: 0 },
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float vignette;
    uniform float grain;
    uniform float time;
    uniform float aspect;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, saturation);
      col = (col - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5;
      d.x *= aspect;
      float v = smoothstep(0.95, 0.25, length(d));
      col *= mix(1.0, v, vignette);
      float n = rand(vUv * vec2(1920.0, 1080.0) + fract(time * 7.13) * 100.0) - 0.5;
      col += n * grain * (1.2 - luma);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `,
};

/** The chain of screen effects drawn after the 3D scene. */
export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private time = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.5, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.grade.uniforms.aspect.value = width / Math.max(1, height);
  }

  render(dt: number): void {
    const p = tuning.postFx;
    if (!p.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    this.bloom.strength = p.bloomStrength;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    const u = this.grade.uniforms;
    u.saturation.value = p.saturation;
    u.contrast.value = p.contrast;
    u.vignette.value = p.vignette;
    u.grain.value = p.grain;
    u.time.value = this.time;
    this.composer.render(dt);
  }
}
