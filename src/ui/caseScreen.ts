import { mixHerbs } from '../combat/health';
import { PAD, padButtonName, type PadType } from '../config/controls';
import type { GamepadReader } from '../core/gamepad';
import { itemDef, type Item } from '../inventory/items';
import type { Supplies } from '../inventory/supplies';

// The attache case screen: your items laid out on a grid. Drag them about with
// the mouse (right-click or R turns one on its side), drop a herb on a herb to
// mix them, drop an attachment on a gun to fit it. A controller moves a cursor
// round the grid instead.

export interface CaseHost {
  readonly supplies: Supplies;
  /** Extra lines about a gun item (its upgrades and attachments). */
  weaponLines(item: Item): string[];
  /** Uses a herb or spray. Returns what to tell the player, or null if it can't be used. */
  use(item: Item): string | null;
  /** Throws an item away. Returns a message, or null if it isn't allowed. */
  discard(item: Item): string | null;
  /** Fits an attachment to a gun. Returns a message, or null if it doesn't fit. */
  attach(attachment: Item, weapon: Item): string | null;
  padType(): PadType | null;
}

const CELL = 40;

export class CaseScreen {
  readonly root: HTMLDivElement;
  visible = false;
  onClose: () => void = () => {};
  private host!: CaseHost;
  private readonly grid: HTMLDivElement;
  private readonly itemsLayer: HTMLDivElement;
  private readonly ghost: HTMLDivElement;
  private readonly cursorEl: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly msg: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly hints: HTMLDivElement;
  private selected: Item | null = null;
  private msgTimer = 0;

  /** A mouse drag in progress. */
  private drag: { item: Item; rot: boolean; grabX: number; grabY: number; startX: number; startY: number; moved: boolean } | null = null;
  /** Controller mode: the cursor cell and the item being carried. */
  private cursor = { x: 0, y: 0 };
  private held: { item: Item; rot: boolean } | null = null;
  private padMode = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'case-screen';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="case-panel">
        <div class="case-head">
          <h2>Attach&eacute; case</h2>
          <span class="case-coins"></span>
          <span class="case-head-gap"></span>
          <button type="button" data-act="sort" data-nav>Tidy up</button>
          <button type="button" data-act="close" data-nav>Close</button>
        </div>
        <div class="case-body">
          <div class="case-gridwrap">
            <div class="case-grid">
              <div class="case-items"></div>
              <div class="case-ghost" hidden></div>
              <div class="case-cursor" hidden></div>
            </div>
          </div>
          <div class="case-side">
            <div class="case-info"></div>
            <div class="case-actions">
              <button type="button" data-act="use" data-nav>Use</button>
              <button type="button" data-act="rotate" data-nav>Turn</button>
              <button type="button" data-act="discard" data-nav>Throw away</button>
            </div>
            <div class="case-msg"></div>
            <div class="case-hints"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.grid = q('.case-grid');
    this.itemsLayer = q('.case-items');
    this.ghost = q('.case-ghost');
    this.cursorEl = q('.case-cursor');
    this.info = q('.case-info');
    this.msg = q('.case-msg');
    this.coins = q('.case-coins');
    this.hints = q('.case-hints');

    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn) this.onButton(btn.dataset.act ?? '');
    });
    this.itemsLayer.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.rotateHeld();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // -------------------------------------------------------------------------

  show(host: CaseHost): void {
    this.host = host;
    this.visible = true;
    this.root.hidden = false;
    this.selected = null;
    this.drag = null;
    this.held = null;
    this.padMode = false;
    this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.root.hidden = true;
    this.drag = null;
    this.held = null;
    this.ghost.hidden = true;
    this.cursorEl.hidden = true;
  }

  private get supplies(): Supplies {
    return this.host.supplies;
  }

  /** Redraws everything from the current contents of the case. */
  refresh(): void {
    const g = this.supplies.grid;
    this.grid.style.width = `${g.width * CELL}px`;
    this.grid.style.height = `${g.height * CELL}px`;
    this.grid.style.setProperty('--cell', `${CELL}px`);
    this.itemsLayer.textContent = '';
    for (const item of this.supplies.items) {
      if (item.x === undefined || item.y === undefined) continue;
      const def = itemDef(item);
      const f = g.footprint(item);
      const el = document.createElement('div');
      el.className = `case-item kind-${item.kind}`;
      if (this.selected === item) el.classList.add('selected');
      if (this.drag?.item === item || this.held?.item === item) el.classList.add('lifted');
      el.dataset.id = String(item.id);
      el.style.left = `${item.x * CELL}px`;
      el.style.top = `${item.y * CELL}px`;
      el.style.width = `${f.w * CELL - 2}px`;
      el.style.height = `${f.h * CELL - 2}px`;
      el.style.setProperty('--item', def.color);
      el.innerHTML = `<span class="case-item-name">${shortName(item, def.name)}</span>${herbDots(item)}`;
      this.itemsLayer.appendChild(el);
    }
    this.coins.innerHTML = `<i class="coin-icon"></i>${this.supplies.coins.toLocaleString('en-US')}`;
    this.renderInfo();
    this.renderHints();
    this.updateCursor();
  }

  private renderInfo(): void {
    const item = this.selected && this.supplies.items.includes(this.selected) ? this.selected : null;
    if (!item) {
      this.selected = null;
      this.info.innerHTML = `<div class="case-empty">Pick an item to see what it does.</div><div class="case-free">${this.supplies.grid.freeCells} squares free</div>`;
      this.setButtons(false, false, false);
      return;
    }
    const def = itemDef(item);
    const lines = item.kind === 'weapon' ? this.host.weaponLines(item) : [];
    const sell = item.kind === 'treasure' ? `<div class="case-value">Sells for ${def.value.toLocaleString('en-US')}</div>` : '';
    this.info.innerHTML = `
      <div class="case-name">${def.name}</div>
      <div class="case-blurb">${def.blurb}</div>
      ${sell}
      ${lines.map((l) => `<div class="case-line">${l}</div>`).join('')}
      <div class="case-free">${this.supplies.grid.freeCells} squares free</div>`;
    const usable = item.kind === 'herb' || item.kind === 'spray';
    this.setButtons(usable, def.w !== def.h, true);
  }

  private setButtons(use: boolean, rotate: boolean, discard: boolean): void {
    (this.root.querySelector('[data-act="use"]') as HTMLButtonElement).disabled = !use;
    (this.root.querySelector('[data-act="rotate"]') as HTMLButtonElement).disabled = !rotate;
    (this.root.querySelector('[data-act="discard"]') as HTMLButtonElement).disabled = !discard;
  }

  private renderHints(): void {
    const pad = this.host.padType();
    if (pad && this.padMode) {
      const n = (b: number) => padButtonName(b, pad);
      this.hints.innerHTML = `${n(PAD.south)} pick up / put down &middot; ${n(PAD.west)} turn &middot; ${n(PAD.north)} use &middot; ${n(PAD.r1)} tidy up &middot; ${n(PAD.east)} close`;
    } else {
      this.hints.innerHTML = 'Drag items to move them &middot; <b>R</b> or right-click turns one &middot; drop a herb on a herb to mix &middot; drop an attachment on a gun to fit it &middot; <b>Tab</b> or <b>Esc</b> closes';
    }
  }

  private say(text: string, bad = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle('bad', bad);
    this.msgTimer = 3;
  }

  private onButton(act: string): void {
    switch (act) {
      case 'close':
        this.onClose();
        break;
      case 'sort':
        {
          const ok = this.supplies.sort();
          this.say(ok ? 'Everything is packed tight.' : 'Could not repack the case.', !ok);
          this.refresh();
        }
        break;
      case 'use':
        if (this.selected) this.useSelected();
        break;
      case 'rotate':
        this.rotateSelected();
        break;
      case 'discard':
        if (this.selected) this.discardSelected();
        break;
    }
  }

  private useSelected(): void {
    const item = this.selected;
    if (!item) return;
    const result = this.host.use(item);
    if (result) this.say(result);
    else this.say('That cannot be used now.', true);
    this.refresh();
  }

  private discardSelected(): void {
    const item = this.selected;
    if (!item) return;
    const result = this.host.discard(item);
    if (result) {
      this.say(result);
      this.selected = null;
    } else {
      this.say('You need to keep that.', true);
    }
    this.refresh();
  }

  private rotateSelected(): void {
    const item = this.selected;
    if (!item) return;
    const g = this.supplies.grid;
    if (g.move(item, item.x ?? 0, item.y ?? 0, !(item.rot ?? false))) {
      this.refresh();
      return;
    }
    // Turning in place bumps into something: try the nearest free spot for the turned item.
    const rot = !(item.rot ?? false);
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (g.move(item, (item.x ?? 0) + dx, (item.y ?? 0) + dy, rot)) {
            this.refresh();
            return;
          }
        }
      }
    }
    this.say('No room to turn that.', true);
  }

  // -------------------------------------------------------------------------
  // Mouse

  private cellAt(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.grid.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / CELL), y: Math.floor((e.clientY - r.top) / CELL) };
  }

  private itemFromEvent(e: Event): Item | null {
    const el = (e.target as HTMLElement).closest('.case-item') as HTMLElement | null;
    if (!el) return null;
    return this.supplies.items.find((i) => i.id === Number(el.dataset.id)) ?? null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.visible) return;
    const item = this.itemFromEvent(e);
    if (!item) {
      this.selected = null;
      this.refresh();
      return;
    }
    const c = this.cellAt(e);
    this.selected = item;
    this.padMode = false;
    this.drag = { item, rot: item.rot ?? false, grabX: c.x - (item.x ?? 0), grabY: c.y - (item.y ?? 0), startX: e.clientX, startY: e.clientY, moved: false };
    this.refresh();
    e.preventDefault();
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.visible || !this.drag) return;
    if (!this.drag.moved && Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) < 5) return;
    this.drag.moved = true;
    const c = this.cellAt(e);
    this.showGhost(this.drag.item, this.drag.rot, c.x - this.drag.grabX, c.y - this.drag.grabY, c);
    this.refresh();
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.visible || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    this.ghost.hidden = true;
    if (d.moved) {
      const c = this.cellAt(e);
      this.drop(d.item, c.x - d.grabX, c.y - d.grabY, d.rot, c);
    }
    this.refresh();
  }

  /** Shows where a carried item would land (green) or why it can't (red). */
  private showGhost(item: Item, rot: boolean, x: number, y: number, pointer: { x: number; y: number }): void {
    const g = this.supplies.grid;
    const f = g.footprint(item, rot);
    this.ghost.hidden = false;
    this.ghost.style.left = `${x * CELL}px`;
    this.ghost.style.top = `${y * CELL}px`;
    this.ghost.style.width = `${f.w * CELL - 2}px`;
    this.ghost.style.height = `${f.h * CELL - 2}px`;
    const target = g.itemAt(pointer.x, pointer.y, item);
    const combine = target && this.canCombine(item, target);
    this.ghost.classList.toggle('ok', g.canPlace(item, x, y, rot, item) || !!combine);
    this.ghost.classList.toggle('combine', !!combine);
  }

  private canCombine(a: Item, b: Item): boolean {
    if (a.kind === 'herb' && b.kind === 'herb') return mixHerbs(a.key, b.key) !== null;
    if (a.kind === 'attachment' && b.kind === 'weapon') return true;
    return false;
  }

  /** Puts a carried item down: on another item (to combine) or on empty squares (to move). */
  private drop(item: Item, x: number, y: number, rot: boolean, pointer: { x: number; y: number }): void {
    const g = this.supplies.grid;
    const target = g.itemAt(pointer.x, pointer.y, item);
    if (target && target !== item) {
      if (item.kind === 'herb' && target.kind === 'herb') {
        const mixed = this.supplies.combine(target.id, item.id);
        if (mixed) {
          this.selected = mixed;
          this.say(`Mixed into ${itemDef(mixed).name}.`);
        } else {
          this.say('Those do not mix.', true);
        }
        return;
      }
      if (item.kind === 'attachment' && target.kind === 'weapon') {
        const result = this.host.attach(item, target);
        if (result) {
          this.say(result);
          this.selected = target;
        } else {
          this.say('That does not fit this gun.', true);
        }
        return;
      }
    }
    if (g.move(item, x, y, rot)) {
      this.selected = item;
      return;
    }
    // Maybe it fits if nudged to the nearest spot the pointer is over.
    this.say('Does not fit there.', true);
  }

  // -------------------------------------------------------------------------
  // Keyboard and controller

  private onKey(e: KeyboardEvent): void {
    if (!this.visible) return;
    if (e.code === 'KeyR') {
      if (this.drag) {
        this.drag.rot = !this.drag.rot;
        e.preventDefault();
      } else {
        this.rotateHeld();
      }
    } else if (e.code === 'Delete' || e.code === 'KeyX') {
      this.discardSelected();
    } else if (e.code === 'KeyE' || e.code === 'KeyH') {
      this.useSelected();
    }
  }

  private rotateHeld(): void {
    if (this.drag) {
      this.drag.rot = !this.drag.rot;
    } else if (this.held) {
      this.held.rot = !this.held.rot;
      this.updateCursor();
    } else {
      this.rotateSelected();
    }
  }

  /** Call every frame while the case is open. */
  poll(pad: GamepadReader, dt: number): void {
    this.msgTimer -= dt;
    if (this.msgTimer <= 0 && this.msg.textContent) this.msg.textContent = '';
    if (!pad.connected || !this.visible) return;
    const g = this.supplies.grid;
    let moved = false;
    const step = (dx: number, dy: number) => {
      this.cursor.x = Math.max(0, Math.min(g.width - 1, this.cursor.x + dx));
      this.cursor.y = Math.max(0, Math.min(g.height - 1, this.cursor.y + dy));
      moved = true;
    };
    if (pad.wasPressed(PAD.up)) step(0, -1);
    if (pad.wasPressed(PAD.down)) step(0, 1);
    if (pad.wasPressed(PAD.left)) step(-1, 0);
    if (pad.wasPressed(PAD.right)) step(1, 0);
    this.stickCursor(pad, dt, step);
    if (moved) this.padMode = true;

    if (pad.wasPressed(PAD.south)) {
      this.padMode = true;
      if (this.held) {
        const h = this.held;
        this.held = null;
        const target = g.itemAt(this.cursor.x, this.cursor.y, h.item);
        this.drop(h.item, this.cursor.x, this.cursor.y, h.rot, target ? this.cursor : { x: -1, y: -1 });
      } else {
        const item = g.itemAt(this.cursor.x, this.cursor.y);
        this.selected = item;
        if (item) this.held = { item, rot: item.rot ?? false };
      }
      this.refresh();
    } else if (pad.wasPressed(PAD.west)) {
      this.padMode = true;
      this.rotateHeld();
      this.refresh();
    } else if (pad.wasPressed(PAD.north)) {
      this.useSelected();
    } else if (pad.wasPressed(PAD.r1)) {
      this.onButton('sort');
    } else if (pad.wasPressed(PAD.east)) {
      if (this.held) {
        this.held = null;
        this.refresh();
      } else {
        this.onClose();
      }
    } else if (moved) {
      if (!this.held) this.selected = g.itemAt(this.cursor.x, this.cursor.y);
      this.refresh();
    }
  }

  private stickTimer = 0;
  private stickCell: { x: number; y: number } | null = null;

  private stickCursor(pad: GamepadReader, dt: number, step: (dx: number, dy: number) => void): void {
    const x = pad.leftX;
    const y = pad.leftY;
    const dx = Math.abs(x) > 0.6 ? Math.sign(x) : 0;
    const dy = Math.abs(y) > 0.6 ? Math.sign(y) : 0;
    if (dx === 0 && dy === 0) {
      this.stickCell = null;
      this.stickTimer = 0;
      return;
    }
    this.stickTimer -= dt;
    if (!this.stickCell || this.stickTimer <= 0) {
      step(Math.abs(x) >= Math.abs(y) ? dx : 0, Math.abs(y) > Math.abs(x) ? dy : 0);
      this.stickCell = { x: dx, y: dy };
      this.stickTimer = 0.16;
    }
  }

  /** Draws the controller cursor (and the carried item under it). */
  private updateCursor(): void {
    if (!this.padMode) {
      this.cursorEl.hidden = true;
      if (!this.drag) this.ghost.hidden = true;
      return;
    }
    const g = this.supplies.grid;
    this.cursorEl.hidden = false;
    this.cursorEl.style.left = `${this.cursor.x * CELL}px`;
    this.cursorEl.style.top = `${this.cursor.y * CELL}px`;
    this.cursorEl.style.width = `${CELL - 2}px`;
    this.cursorEl.style.height = `${CELL - 2}px`;
    if (this.held) {
      this.showGhost(this.held.item, this.held.rot, this.cursor.x, this.cursor.y, this.cursor);
    } else if (!this.drag) {
      this.ghost.hidden = true;
    }
    void g;
  }
}

/** A short label that fits a small box. */
function shortName(item: Item, name: string): string {
  if (item.kind === 'herb') return item.key.length === 1 ? 'Herb' : 'Mix';
  if (item.kind === 'spray') return 'Spray';
  if (item.kind === 'grenade') return item.key === 'frag' ? 'Frag' : item.key === 'flash' ? 'Flash' : 'Fire';
  return name;
}

function herbDots(item: Item): string {
  if (item.kind !== 'herb') return '';
  const colors: Record<string, string> = { G: '#4fc04a', R: '#d6403a', Y: '#e6c93a' };
  return `<span class="herb-dots">${item.key
    .split('')
    .map((c) => `<i style="background:${colors[c]}"></i>`)
    .join('')}</span>`;
}
