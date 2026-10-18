import type { CrosshairStyle } from '../config/settings';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Half the drawing area; the crosshair is drawn around the centre (0, 0). */
const HALF = 200;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * The on-screen crosshair, in one of several styles. Styles that show aim
 * steadiness (ring, cross, brackets) grow and shrink with the reticle size.
 */
export class Crosshair {
  readonly svg: SVGSVGElement;
  private style: CrosshairStyle | null = null;
  private color = '';
  private size = 0;
  private readonly group: SVGGElement;
  private parts: SVGElement[] = [];

  constructor() {
    this.svg = el('svg', { viewBox: `${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`, width: HALF * 2, height: HALF * 2 });
    this.svg.classList.add('crosshair');
    this.group = el('g', {});
    this.svg.appendChild(this.group);
  }

  /** Choose the look. Rebuilds the shapes only when something changed. */
  configure(style: CrosshairStyle, color: string, size: number): void {
    if (style === this.style && color === this.color && size === this.size) return;
    this.style = style;
    this.color = color;
    this.size = size;
    this.group.replaceChildren();
    this.parts = [];
    const stroke = { stroke: color, 'stroke-width': 1.6 * size, fill: 'none', 'stroke-linecap': 'round' };
    const add = <T extends SVGElement>(e: T): T => {
      this.group.appendChild(e);
      this.parts.push(e);
      return e;
    };
    switch (style) {
      case 'ring':
        add(el('circle', { cx: 0, cy: 0, r: 10, ...stroke }));
        for (let i = 0; i < 4; i++) add(el('line', { ...stroke, 'stroke-width': 2 * size }));
        break;
      case 'cross':
        for (let i = 0; i < 4; i++) add(el('line', { ...stroke, 'stroke-width': 2 * size }));
        add(el('circle', { cx: 0, cy: 0, r: 1.6 * size, fill: color }));
        break;
      case 'brackets':
        for (let i = 0; i < 4; i++) add(el('polyline', { ...stroke, 'stroke-width': 2 * size, 'stroke-linejoin': 'round' }));
        add(el('circle', { cx: 0, cy: 0, r: 1.2 * size, fill: color }));
        break;
      case 'dot':
        add(el('circle', { cx: 0, cy: 0, r: 2.6 * size, fill: color }));
        break;
      case 'laser':
      case 'none':
        break;
    }
  }

  /** Redraw for the current aim: `radius` in screen pixels, `focus` 0..1. */
  update(radius: number, focus: number): void {
    const r = Math.min(HALF - 20, Math.max(6, radius));
    const s = this.size;
    const tick = 7 * s;
    const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    switch (this.style) {
      case 'ring': {
        this.parts[0].setAttribute('r', String(r));
        dirs.forEach(([dx, dy], i) => {
          const l = this.parts[i + 1];
          l.setAttribute('x1', String(dx * (r + 2)));
          l.setAttribute('y1', String(dy * (r + 2)));
          l.setAttribute('x2', String(dx * (r + 2 + tick)));
          l.setAttribute('y2', String(dy * (r + 2 + tick)));
        });
        break;
      }
      case 'cross': {
        const gap = Math.max(4 * s, r * 0.85);
        dirs.forEach(([dx, dy], i) => {
          const l = this.parts[i];
          l.setAttribute('x1', String(dx * gap));
          l.setAttribute('y1', String(dy * gap));
          l.setAttribute('x2', String(dx * (gap + 9 * s)));
          l.setAttribute('y2', String(dy * (gap + 9 * s)));
        });
        break;
      }
      case 'brackets': {
        const c = r * 0.75;
        const arm = Math.max(5, Math.min(12 * s, c * 0.6));
        const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        corners.forEach(([sx, sy], i) => {
          const x = sx * c;
          const y = sy * c;
          this.parts[i].setAttribute('points', `${x - sx * arm},${y} ${x},${y} ${x},${y - sy * arm}`);
        });
        break;
      }
      default:
        break;
    }
    // A fully steady aim is drawn bolder.
    this.svg.style.opacity = focus > 0.95 ? '1' : '0.7';
  }
}

/** A small static picture of a style, for the Settings screen. */
export function crosshairIcon(style: CrosshairStyle, color: string, size = 1): string {
  const c = new Crosshair();
  c.configure(style, color, size);
  c.update(style === 'dot' ? 0 : 16, 1);
  // Not the in-game crosshair, so drop its class (which hides it until aiming).
  c.svg.removeAttribute('class');
  c.svg.setAttribute('viewBox', '-34 -34 68 68');
  c.svg.setAttribute('width', '56');
  c.svg.setAttribute('height', '56');
  if (style === 'laser') {
    c.svg.innerHTML = '<circle cx="0" cy="0" r="7" fill="rgba(255,40,30,0.35)"/><circle cx="0" cy="0" r="3" fill="#ff3020"/>';
  } else if (style === 'none') {
    c.svg.innerHTML = '<line x1="-12" y1="-12" x2="12" y2="12" stroke="#777" stroke-width="2"/>';
  }
  return c.svg.outerHTML;
}
