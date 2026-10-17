import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MathUtils,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import { tuning } from '../config/tuning';
import type { Lamp } from './props';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vec4(p.xy, p.w * 0.99999, p.w); // always at the far distance
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 glowColor;
  uniform vec3 sunDir;
  uniform float glowStrength;
  varying vec3 vDir;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float az = atan(d.z, d.x);
    vec3 col = mix(horizonColor, topColor, pow(smoothstep(-0.02, 0.55, h), 0.65));
    float s = max(dot(d, sunDir), 0.0);
    float nearHorizon = 1.0 - smoothstep(0.0, 0.4, h);
    col += glowColor * pow(s, 5.0) * nearHorizon * glowStrength;
    col += glowColor * pow(s, 60.0) * glowStrength * 0.5;
    // A few faint early stars high up.
    float star = step(0.9975, hash(floor(d * 320.0))) * smoothstep(0.3, 0.8, h);
    col += vec3(star * 0.35);
    // Distant ridge line in silhouette; below it (and below the horizon) is far-off dark land.
    vec3 land = horizonColor * 0.42;
    float ridge = 0.03 + 0.018 * sin(az * 3.0 + 1.0) + 0.011 * sin(az * 7.3 + 2.0) + 0.005 * sin(az * 19.0 + 0.5);
    col = mix(col, land, 1.0 - smoothstep(ridge - 0.003, ridge + 0.003, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Sky, fog, sun and sky light: the dusk mood shared by every level. */
export class Environment {
  readonly sun: DirectionalLight;
  readonly skyLight: HemisphereLight;
  readonly fog: FogExp2;
  private readonly sky: Mesh;
  private readonly skyUniforms = {
    topColor: { value: new Color() },
    horizonColor: { value: new Color() },
    glowColor: { value: new Color() },
    sunDir: { value: new Vector3() },
    glowStrength: { value: 1 },
  };
  private readonly colorCache = new Map<Color, string>();

  constructor(private readonly scene: Scene) {
    this.fog = new FogExp2(tuning.atmosphere.fogColor, tuning.atmosphere.fogDensity);
    scene.fog = this.fog;
    scene.background = new Color(tuning.atmosphere.fogColor);

    this.sky = new Mesh(
      new SphereGeometry(900, 32, 16),
      new ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.sky.raycast = () => {}; // bullets fly through the sky
    scene.add(this.sky);

    this.skyLight = new HemisphereLight(tuning.atmosphere.skyLightColor, tuning.atmosphere.groundBounceColor, 1);
    scene.add(this.skyLight);

    this.sun = new DirectionalLight(tuning.atmosphere.sunColor, 1);
    this.sun.castShadow = tuning.graphics.shadows;
    const cam = this.sun.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 1;
    cam.far = 200;
    this.sun.shadow.mapSize.set(tuning.graphics.shadowMapSize, tuning.graphics.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    scene.add(this.sun, this.sun.target);
    this.update(0, null, []);
  }

  private setColor(color: Color, hex: string): void {
    if (this.colorCache.get(color) === hex) return;
    color.set(hex);
    this.colorCache.set(color, hex);
  }

  /** Brings sky, fog and lights in line with the tuning values, and animates lamp flicker. */
  update(time: number, camera: Camera | null, lamps: Lamp[]): void {
    const a = tuning.atmosphere;
    this.setColor(this.fog.color, a.fogColor);
    this.fog.density = a.fogDensity;
    if (this.scene.background instanceof Color) this.setColor(this.scene.background, a.fogColor);

    const elevation = MathUtils.degToRad(a.sunHeight);
    const sunDir = this.skyUniforms.sunDir.value
      .set(-0.55 * Math.cos(elevation), Math.sin(elevation), -0.83 * Math.cos(elevation))
      .normalize();
    this.setColor(this.skyUniforms.topColor.value, a.skyTopColor);
    this.setColor(this.skyUniforms.horizonColor.value, a.fogColor);
    this.setColor(this.skyUniforms.glowColor.value, a.sunGlowColor);
    this.skyUniforms.glowStrength.value = a.sunGlowStrength;
    if (camera) this.sky.position.copy(camera.position);

    this.setColor(this.sun.color, a.sunColor);
    this.sun.intensity = a.sunIntensity;
    this.sun.position.copy(sunDir).multiplyScalar(80);
    this.sun.target.position.set(0, 0, 0);

    this.setColor(this.skyLight.color, a.skyLightColor);
    this.setColor(this.skyLight.groundColor, a.groundBounceColor);
    this.skyLight.intensity = a.skyLightIntensity;

    for (const lamp of lamps) {
      const t = time + lamp.phase;
      const wobble = Math.sin(t * 11) * 0.5 + Math.sin(t * 17.3 + 1.3) * 0.3 + Math.sin(t * 31.7 + 2.1) * 0.2;
      const k = 1 + wobble * a.lampFlicker * lamp.flicker * 0.6;
      if (lamp.light) {
        this.setColor(lamp.light.color, a.lampColor);
        lamp.light.intensity = a.lampIntensity * k;
        lamp.light.distance = a.lampRange;
      }
      this.setColor(lamp.glow.emissive, a.lampColor);
      lamp.glow.emissiveIntensity = (a.lampIntensity / 5) * k;
    }
  }
}
