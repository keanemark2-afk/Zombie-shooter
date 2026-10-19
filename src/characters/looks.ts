import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Material } from 'three';
import { fbm, seededRandom } from '../world/textures';

// Clothing and skin for the placeholder characters, all painted in code.

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, img: ImageData) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.createImageData(size, size);
  paint(ctx, img);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Noise-based cloth or skin: base colour, darker blotches and fine weave. */
function fabric(base: string, dark: string, seed: number, opts: { weave?: number; holes?: number; stains?: number } = {}): CanvasTexture {
  const size = 128;
  const b = hex(base);
  const d = hex(dark);
  const rand = seededRandom(seed);
  return canvasTexture(size, (ctx, img) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const blotch = fbm(u, v, 4, 4, seed);
        const fine = fbm(u, v, 32, 2, seed + 5);
        const weave = opts.weave ? ((x + y) % 2) * opts.weave : 0;
        const t = Math.min(1, Math.max(0, (blotch - 0.4) * 1.6 * (opts.stains ?? 1)));
        const k = 0.85 + fine * 0.3 - weave;
        const i = (y * size + x) * 4;
        img.data[i] = (b[0] + (d[0] - b[0]) * t) * k;
        img.data[i + 1] = (b[1] + (d[1] - b[1]) * t) * k;
        img.data[i + 2] = (b[2] + (d[2] - b[2]) * t) * k;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Ragged tears showing dark skin/shadow underneath.
    for (let h = 0; h < (opts.holes ?? 0); h++) {
      const cx = rand() * size;
      const cy = rand() * size;
      ctx.fillStyle = 'rgba(30, 28, 22, 0.9)';
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        const r = 3 + rand() * 7;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6);
      }
      ctx.fill();
    }
  });
}

const cache = new Map<string, Material>();

function material(key: string, make: () => MeshStandardMaterial): Material {
  let m = cache.get(key);
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}

export interface CharacterLook {
  skin: Material;
  shirt: Material;
  sleeves: Material;
  forearms: Material;
  pants: Material;
  shoes: Material;
  hands: Material;
  hair: Material | null;
  eyes: Material;
  /** Width multiplier for the body. */
  build: number;
  /** Overall size multiplier. */
  height: number;
  /** Forward stoop of the upper body, in radians. */
  hunch: number;
  zombie: boolean;
}

const SHIRTS = ['#8f8468', '#66717d', '#806b55', '#6f7756', '#827a72', '#93806c', '#5f6b68'];
const PANTS = ['#55503f', '#4c5361', '#615443', '#535a46', '#46433d'];
const SKINS = ['#8a9a7c', '#97a283', '#829079', '#9a9c86'];

export type LookVariant = 'normal' | 'brute' | 'sawyer' | 'runner';

/** A random-looking but repeatable zombie outfit. */
export function zombieLook(seed: number, variant: LookVariant = 'normal'): CharacterLook {
  const rand = seededRandom(seed * 7919 + 13);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const skinColor = pick(SKINS);
  const shirtColor = pick(SHIRTS);
  const pantsColor = pick(PANTS);
  const shirtVariant = Math.floor(rand() * 3);
  const skin = material(`zskin${skinColor}`, () =>
    new MeshStandardMaterial({ map: fabric(skinColor, '#4b4a3c', 11 + skinColor.length, { stains: 1.3 }), roughness: 0.75 }),
  );
  const shirt = material(`zshirt${shirtColor}${shirtVariant}`, () =>
    new MeshStandardMaterial({
      map: fabric(shirtColor, '#3a3024', 40 + shirtVariant, { weave: 0.06, holes: 4 + shirtVariant * 2, stains: 1.4 }),
      roughness: 0.95,
    }),
  );
  const pants = material(`zpants${pantsColor}`, () =>
    new MeshStandardMaterial({ map: fabric(pantsColor, '#221e18', 70, { weave: 0.05, holes: 2 }), roughness: 0.95 }),
  );
  const shoes = material('zshoes', () => new MeshStandardMaterial({ color: '#2a231c', roughness: 0.8 }));
  const eyes = material('zeyes', () =>
    new MeshStandardMaterial({ color: '#d8cf9a', emissive: '#6b5a20', emissiveIntensity: 0.6, roughness: 0.3 }),
  );
  const hair = rand() < 0.6 ? material('zhair', () => new MeshStandardMaterial({ color: '#2b2620', roughness: 1 })) : null;
  const look: CharacterLook = {
    skin,
    shirt,
    sleeves: rand() < 0.5 ? shirt : skin,
    forearms: skin,
    pants,
    shoes,
    hands: skin,
    hair,
    eyes,
    build: 0.95 + rand() * 0.14,
    height: 0.94 + rand() * 0.1,
    hunch: 0.18 + rand() * 0.15,
    zombie: true,
  };
  if (variant === 'brute') {
    // Bare-chested and enormous.
    look.shirt = skin;
    look.sleeves = skin;
    look.pants = material('zbrutepants', () => new MeshStandardMaterial({ map: fabric('#3a342c', '#14110e', 90, { weave: 0.05, holes: 3 }), roughness: 0.95 }));
    look.hair = null;
    look.build *= 1.4;
    look.hunch += 0.14;
  } else if (variant === 'sawyer') {
    const leather = material('zleather', () => new MeshStandardMaterial({ map: fabric('#3a2a20', '#150f0b', 95, { weave: 0.03, stains: 1.8 }), roughness: 0.75 }));
    look.shirt = leather;
    look.sleeves = leather;
    look.pants = material('zsawpants', () => new MeshStandardMaterial({ map: fabric('#26211c', '#0c0a08', 96, { weave: 0.05 }), roughness: 0.95 }));
    look.hair = null;
    look.hunch = 0.1;
  } else if (variant === 'runner') {
    look.build *= 0.88;
    look.hunch += 0.1;
  }
  return look;
}

/** The player: dark jacket, readable silhouette from behind. */
export function playerLook(): CharacterLook {
  return {
    skin: material('pskin', () => new MeshStandardMaterial({ color: '#c49a7c', roughness: 0.7 })),
    shirt: material('pjacket', () =>
      new MeshStandardMaterial({ map: fabric('#2e2a27', '#151312', 300, { weave: 0.04, stains: 0.6 }), roughness: 0.7 }),
    ),
    sleeves: material('pjacket', () => new MeshStandardMaterial()),
    forearms: material('pjacket', () => new MeshStandardMaterial()),
    pants: material('ppants', () =>
      new MeshStandardMaterial({ map: fabric('#2c3038', '#16181c', 301, { weave: 0.05 }), roughness: 0.85 }),
    ),
    shoes: material('pboots', () => new MeshStandardMaterial({ color: '#1d1814', roughness: 0.6 })),
    hands: material('pgloves', () => new MeshStandardMaterial({ color: '#1b1917', roughness: 0.65 })),
    hair: material('phair', () => new MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.9 })),
    eyes: material('peyes', () => new MeshStandardMaterial({ color: '#1a1a1a' })),
    build: 1.04,
    height: 1.0,
    hunch: 0,
    zombie: false,
  };
}

/** The Trader: a hooded figure in a long dark cloak, gloved hands, eyes glowing like two embers. */
export function traderLook(): CharacterLook {
  const cloak = material('tcloak', () => new MeshStandardMaterial({ map: fabric('#3b2a3a', '#17101a', 400, { weave: 0.05, stains: 0.8 }), roughness: 0.9 }));
  return {
    skin: material('tskin', () => new MeshStandardMaterial({ color: '#1a1315', roughness: 0.8 })),
    shirt: cloak,
    sleeves: cloak,
    forearms: material('tglove', () => new MeshStandardMaterial({ color: '#2a2018', roughness: 0.7 })),
    pants: cloak,
    shoes: material('tboots', () => new MeshStandardMaterial({ color: '#17110e', roughness: 0.6 })),
    hands: material('tglove', () => new MeshStandardMaterial()),
    hair: null,
    eyes: material('teyes', () => new MeshStandardMaterial({ color: '#000000', emissive: '#ffb347', emissiveIntensity: 2.4 })),
    build: 1.12,
    height: 1.02,
    hunch: 0.1,
    zombie: false,
  };
}
