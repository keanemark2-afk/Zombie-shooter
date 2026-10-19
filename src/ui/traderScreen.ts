import { ATTACHMENT_NAMES, EXCLUSIVES, STAT_NAMES, UPGRADE_STATS, type WeaponUpgrades } from '../combat/upgrades';
import { PAD, padButtonName, type PadType } from '../config/controls';
import type { GamepadReader } from '../core/gamepad';
import { itemDef, type Item } from '../inventory/items';
import type { Offer, Outcome, Trader } from '../inventory/shop';
import type { Supplies } from '../inventory/supplies';
import { PadNav } from './padNav';
import { traderLine, type LineKind } from './traderLines';

// The Trader's menu: Buy, Sell, Upgrade, Tune-up and Case tabs. A row does its
// thing when clicked (or when Cross / Enter is pressed on it); the panel on the
// right describes whatever row is under the pointer or highlighted.

export interface TraderUiHost {
  readonly trader: Trader;
  readonly supplies: Supplies;
  readonly upgrades: WeaponUpgrades;
  /** The guns in the case, in slot order. */
  ownedWeapons(): Array<{ id: string; name: string }>;
  knifeCondition(): number;
  padType(): PadType | null;
  /** Sound hooks. */
  sound(kind: 'click' | 'buy' | 'no'): void;
}

type Tab = 'buy' | 'sell' | 'upgrade' | 'tune' | 'case';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 'upgrade', label: 'Upgrade' },
  { id: 'tune', label: 'Tune-up' },
  { id: 'case', label: 'Cases' },
];

interface Row {
  label: string;
  sub?: string;
  price?: string;
  detail: string;
  /** Greyed out: can't be done now (still shown, and still gives the reason when pressed). */
  dim?: boolean;
  /** A heading, not a button. */
  header?: boolean;
  run?: () => Outcome;
  /** Which kind of line the Trader says afterwards. */
  says?: LineKind;
}

export class TraderScreen {
  readonly root: HTMLDivElement;
  visible = false;
  onClose: () => void = () => {};
  onReady: () => void = () => {};
  onOpenCase: () => void = () => {};
  private host!: TraderUiHost;
  private tab: Tab = 'buy';
  private rows: Row[] = [];
  private readonly list: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly voice: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly timer: HTMLSpanElement;
  private readonly tabsEl: HTMLDivElement;
  private readonly nav: PadNav;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'trader-screen';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="trader-panel">
        <div class="trader-head">
          <div class="trader-voice"></div>
          <span class="case-coins"></span>
        </div>
        <div class="trader-tabs"></div>
        <div class="trader-body">
          <div class="trader-list"></div>
          <div class="trader-detail"></div>
        </div>
        <div class="trader-foot">
          <span class="trader-timer"></span>
          <span class="case-head-gap"></span>
          <button type="button" data-act="case" data-nav>Open case</button>
          <button type="button" data-act="ready" data-nav class="primary">Ready &mdash; next wave</button>
          <button type="button" data-act="leave" data-nav>Step back</button>
        </div>
        <div class="trader-hints"></div>
      </div>`;
    document.body.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.list = q('.trader-list');
    this.detail = q('.trader-detail');
    this.voice = q('.trader-voice');
    this.coins = q('.case-coins');
    this.timer = q('.trader-timer');
    this.tabsEl = q('.trader-tabs');
    this.nav = new PadNav(() => this.root);
    this.tabsEl.innerHTML = TABS.map((t) => `<button type="button" data-tab="${t.id}" data-nav>${t.label}</button>`).join('');

    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const tab = el.closest('[data-tab]') as HTMLElement | null;
      if (tab) {
        this.setTab(tab.dataset.tab as Tab);
        this.host.sound('click');
        return;
      }
      const row = el.closest('[data-row]') as HTMLElement | null;
      if (row) {
        this.runRow(Number(row.dataset.row));
        return;
      }
      const act = (el.closest('button') as HTMLElement | null)?.dataset.act;
      if (act === 'ready') this.onReady();
      else if (act === 'leave') this.onClose();
      else if (act === 'case') this.onOpenCase();
    });
    this.root.addEventListener('pointerover', (e) => {
      const row = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
      if (row) this.showDetail(Number(row.dataset.row));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      if (e.code === 'Escape') {
        this.onClose();
      } else if (this.nav.key(e.code)) {
        e.preventDefault();
        this.afterNav();
      } else if (e.code === 'KeyQ') {
        this.shiftTab(-1);
      } else if (e.code === 'KeyE') {
        this.shiftTab(1);
      }
    });
  }

  show(host: TraderUiHost, greeting = true): void {
    this.host = host;
    this.visible = true;
    this.root.hidden = false;
    this.tab = 'buy';
    if (greeting) this.say('greet');
    this.refresh();
    this.nav.clear();
    this.nav.ensure();
    this.afterNav();
  }

  hide(): void {
    this.visible = false;
    this.root.hidden = true;
    this.nav.clear();
  }

  /** The text beside the Ready button (how long the break has left). */
  setTimer(text: string): void {
    if (this.timer.textContent !== text) this.timer.textContent = text;
  }

  say(kind: LineKind): void {
    this.voice.textContent = `“${traderLine(kind)}”`;
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.refresh();
    this.nav.ensure();
    this.afterNav();
  }

  private shiftTab(dir: number): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.setTab(TABS[(i + dir + TABS.length) % TABS.length].id);
    this.host.sound('click');
  }

  /** When the highlight moves, show what it is on. */
  private afterNav(): void {
    const el = this.nav.focused;
    const row = el?.closest('[data-row]') as HTMLElement | null;
    if (row) this.showDetail(Number(row.dataset.row));
  }

  private showDetail(i: number): void {
    const r = this.rows[i];
    if (!r) return;
    this.detail.innerHTML = `<div class="case-name">${r.label}</div>${r.sub ? `<div class="case-line">${r.sub}</div>` : ''}<div class="case-blurb">${r.detail}</div>${r.price ? `<div class="case-value">${r.price}</div>` : ''}`;
  }

  private runRow(i: number): void {
    const r = this.rows[i];
    if (!r || !r.run) return;
    const outcome = r.run();
    this.host.sound(outcome.ok ? 'buy' : 'no');
    if (outcome.ok) {
      this.say(r.says ?? 'buy');
    } else {
      this.say(outcome.reason === 'room' ? 'full' : outcome.reason === 'money' ? 'broke' : 'refuse');
    }
    const keep = this.list.scrollTop;
    const focusIndex = this.nav.focused?.closest('[data-row]')?.getAttribute('data-row');
    this.refresh();
    this.list.scrollTop = keep;
    // Keep the highlight on the same row.
    const again = focusIndex ? (this.list.querySelector(`[data-row="${focusIndex}"]`) as HTMLElement | null) : null;
    if (again) this.nav.focus(again);
    else this.nav.ensure();
    const msg = document.createElement('div');
    msg.className = `trader-note${outcome.ok ? '' : ' bad'}`;
    msg.textContent = outcome.message;
    this.detail.appendChild(msg);
  }

  // -------------------------------------------------------------------------

  refresh(): void {
    const h = this.host;
    this.coins.innerHTML = `<i class="coin-icon"></i>${h.supplies.coins.toLocaleString('en-US')}`;
    for (const b of this.tabsEl.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.rows = this.buildRows();
    this.list.textContent = '';
    this.rows.forEach((r, i) => {
      if (r.header) {
        const head = document.createElement('div');
        head.className = 'trade-head';
        head.textContent = r.label;
        this.list.appendChild(head);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `trade-row${r.dim ? ' dim' : ''}`;
      b.dataset.row = String(i);
      b.dataset.nav = '';
      b.innerHTML = `<span class="trade-name">${r.label}</span>${r.sub ? `<span class="trade-sub">${r.sub}</span>` : ''}<span class="trade-price">${r.price ?? ''}</span>`;
      this.list.appendChild(b);
    });
    if (this.rows.length === 0) this.list.innerHTML = '<div class="case-empty">Nothing here.</div>';
    const first = this.rows.findIndex((r) => !r.header);
    if (first >= 0) this.showDetail(first);
    this.renderHints();
  }

  private renderHints(): void {
    const pad = this.host.padType();
    const hints = this.root.querySelector('.trader-hints') as HTMLElement;
    if (pad) {
      const n = (b: number) => padButtonName(b, pad);
      hints.innerHTML = `${n(PAD.south)} choose &middot; ${n(PAD.l1)} / ${n(PAD.r1)} change tab &middot; ${n(PAD.east)} step back`;
    } else {
      hints.innerHTML = 'Click a row to buy, sell or upgrade &middot; arrow keys move &middot; <b>Q</b> / <b>E</b> change tab &middot; <b>Esc</b> steps back';
    }
  }

  private money(n: number): string {
    return n.toLocaleString('en-US');
  }

  private buildRows(): Row[] {
    switch (this.tab) {
      case 'buy':
        return this.buyRows();
      case 'sell':
        return this.sellRows();
      case 'upgrade':
        return this.upgradeRows();
      case 'tune':
        return this.tuneRows();
      case 'case':
        return this.caseRows();
    }
  }

  private buyRows(): Row[] {
    const h = this.host;
    const out: Row[] = [];
    const groups: Array<[Offer['group'], string]> = [
      ['weapon', 'Guns'],
      ['ammo', 'Ammunition'],
      ['supply', 'Supplies'],
      ['attachment', 'Attachments'],
    ];
    const offers = h.trader.offers();
    for (const [group, title] of groups) {
      const list = offers.filter((o) => o.group === group);
      if (list.length === 0) continue;
      out.push({ label: title, detail: '', header: true });
      for (const o of list) {
        const size = o.item ? itemDef(o.item) : null;
        out.push({
          label: o.name,
          sub: size ? `${size.w}×${size.h}` : undefined,
          price: this.money(o.price),
          detail: o.blurb + (size ? ` Takes up ${size.w}×${size.h} squares in your case.` : ''),
          dim: h.supplies.coins < o.price,
          run: () => h.trader.buy(o),
          says: 'buy',
        });
      }
    }
    return out;
  }

  private sellRows(): Row[] {
    const h = this.host;
    const out: Row[] = [];
    const items = [...h.supplies.items].sort((a, b) => h.trader.sellPrice(b) - h.trader.sellPrice(a));
    if (items.length === 0) return out;
    const label = (it: Item) => itemDef(it).name;
    for (const it of items) {
      const price = h.trader.sellPrice(it);
      out.push({
        label: label(it),
        price: this.money(price),
        detail: it.kind === 'treasure' ? 'Treasure: this is where it earns its keep.' : itemDef(it).blurb,
        run: () => h.trader.sell(it),
        says: 'sell',
      });
    }
    return out;
  }

  private upgradeRows(): Row[] {
    const h = this.host;
    const out: Row[] = [];
    for (const w of h.ownedWeapons()) {
      out.push({ label: w.name, detail: '', header: true });
      for (const stat of UPGRADE_STATS) {
        const level = h.upgrades.level(w.id, stat);
        const max = h.upgrades.maxLevel(w.id);
        const cost = h.trader.upgradeCost(w.id, stat);
        const pips = '●'.repeat(level) + '○'.repeat(max - level);
        out.push({
          label: STAT_NAMES[stat],
          sub: pips,
          price: cost === null ? 'MAX' : this.money(cost),
          detail: `${statBlurb(stat)} Level ${level} of ${max}.`,
          dim: cost === null || h.supplies.coins < cost,
          run: () => h.trader.upgrade(w.id, stat),
          says: 'upgrade',
        });
      }
      const ex = EXCLUSIVES[w.id];
      if (ex) {
        const has = h.upgrades.hasExclusive(w.id);
        const open = h.upgrades.canBuyExclusive(w.id);
        out.push({
          label: `★ ${ex.name}`,
          sub: has ? 'owned' : open ? 'ready' : 'locked',
          price: has ? 'OWNED' : this.money(h.trader.exclusiveCost(w.id)),
          detail: `Exclusive Upgrade: ${ex.blurb} ${has ? '' : open ? '' : 'Unlocks when all four stats are at their best.'}`,
          dim: !open,
          run: () => h.trader.buyExclusive(w.id),
          says: 'upgrade',
        });
      }
      const fitted = h.upgrades.attachmentsOf(w.id);
      if (fitted.length) {
        out.push({ label: 'Fitted', sub: fitted.map((a) => ATTACHMENT_NAMES[a as keyof typeof ATTACHMENT_NAMES] ?? a).join(', '), detail: 'Attachments stay on the gun for good.', header: false, dim: true });
      }
    }
    return out;
  }

  private tuneRows(): Row[] {
    const h = this.host;
    const cond = Math.round(h.knifeCondition() * 100);
    const cost = h.trader.knifeRepairCost();
    return [
      {
        label: 'Knife tune-up',
        sub: `condition ${cond}%`,
        price: cost === 0 ? 'FINE' : this.money(cost),
        detail: 'Parries and finishers wear the knife down, and a broken knife cannot parry. A tune-up puts the edge back.',
        dim: cost === 0 || h.supplies.coins < cost,
        run: () => h.trader.repairKnife(),
        says: 'repair',
      },
    ];
  }

  private caseRows(): Row[] {
    const h = this.host;
    const next = h.trader.nextCase();
    const g = h.supplies.grid;
    const rows: Row[] = [{ label: 'Your case', sub: `${g.width}×${g.height}`, detail: `You are carrying a ${g.width}×${g.height} case with ${g.freeCells} squares free.`, dim: true }];
    if (next) {
      rows.push({
        label: `${next.name} ${next.w}×${next.h}`,
        price: this.money(next.price),
        detail: `A bigger case. ${next.perk || 'More room for everything.'}`,
        dim: h.supplies.coins < next.price,
        run: () => h.trader.buyCase(),
        says: 'upgrade',
      });
    } else {
      rows.push({ label: 'Nothing bigger exists', detail: 'You already have the biggest case I have ever seen.', dim: true });
    }
    return rows;
  }

  /** Call every frame while open (controller). */
  poll(pad: GamepadReader, dt: number): void {
    if (!pad.connected || !this.visible) return;
    const before = this.nav.focused;
    this.nav.poll(pad, dt);
    if (this.nav.focused !== before) this.afterNav();
    if (pad.wasPressed(PAD.l1)) this.shiftTab(-1);
    if (pad.wasPressed(PAD.r1)) this.shiftTab(1);
    if (pad.wasPressed(PAD.east) || pad.wasPressed(PAD.start)) this.onClose();
  }
}

function statBlurb(stat: (typeof UPGRADE_STATS)[number]): string {
  switch (stat) {
    case 'firepower':
      return 'More damage with every shot.';
    case 'fireRate':
      return 'A shorter wait between shots.';
    case 'reload':
      return 'Reloads faster.';
    case 'capacity':
      return 'A bigger magazine.';
  }
}
