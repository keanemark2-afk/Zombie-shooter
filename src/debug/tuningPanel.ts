import GUI from 'lil-gui';
import type { Controller } from 'lil-gui';
import tuningSource from '../config/tuning.ts?raw';
import {
  assignValues,
  diffValues,
  formatCopyText,
  parseTuningSource,
  prettyLabel,
  sliderRange,
  type TuningValue,
} from './tuningMeta';
import { showToast } from './toast';

export type TuningChangeListener = (path: string, value: TuningValue) => void;

/**
 * The F1 tuning panel. Builds a slider, checkbox or colour picker for every value
 * in tuning.ts, with that value's plain-English note as a hover tooltip.
 */
export class TuningPanel {
  readonly gui: GUI;
  private readonly defaults: object;
  private readonly listeners: TuningChangeListener[] = [];
  private readonly liveInfo: Record<string, string> = {};
  private readonly liveFolder: GUI;

  constructor(private readonly values: object) {
    this.defaults = structuredClone(values);
    const notes = parseTuningSource(tuningSource);

    this.gui = new GUI({ title: 'Tuning  (F1 to hide)', width: 340 });
    this.gui.domElement.classList.add('tuning-panel');

    const actions = {
      copyValues: () => this.copyValues(),
      resetAll: () => this.resetAll(),
    };
    this.gui.add(actions, 'copyValues').name('Copy values (paste to Claude)');
    this.gui.add(actions, 'resetAll').name('Reset everything to defaults');

    this.liveFolder = this.gui.addFolder('Live info');
    this.liveFolder.hide(); // shown once something reports live info

    this.buildFolder(this.gui, values, '', notes.values, notes.groups);
    this.gui.hide();

    // After clicking a button or tick box, hand the keyboard back to the game,
    // otherwise Space would "press" the button again instead of flying up.
    this.gui.domElement.addEventListener('click', (e) => {
      const t = e.target;
      const isButton = t instanceof HTMLElement && t.closest('button') !== null;
      const isCheckbox = t instanceof HTMLInputElement && t.type === 'checkbox';
      if (isButton || isCheckbox) requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
    });
  }

  get visible(): boolean {
    return !this.gui._hidden;
  }

  toggle(): void {
    this.gui.show(!this.visible);
  }

  /** Called whenever any value changes from the panel (or a reset). */
  onChange(listener: TuningChangeListener): void {
    this.listeners.push(listener);
  }

  /** Shows a read-only line in the "Live info" folder, e.g. the current difficulty. */
  setLiveInfo(label: string, text: string): void {
    if (!(label in this.liveInfo)) {
      this.liveInfo[label] = text;
      this.liveFolder.add(this.liveInfo, label).disable().listen();
      this.liveFolder.show();
    }
    this.liveInfo[label] = text;
  }

  private buildFolder(
    parent: GUI,
    obj: object,
    prefix: string,
    notes: ReturnType<typeof parseTuningSource>['values'],
    groupNotes: Map<string, string>,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object') {
        const folder = parent.addFolder(prettyLabel(key));
        const groupNote = groupNotes.get(path);
        if (groupNote) folder.domElement.title = groupNote;
        folder.close();
        this.buildFolder(folder, value as object, path, notes, groupNotes);
        continue;
      }

      const note = notes.get(path);
      const target = obj as Record<string, unknown>;
      let controller: Controller;
      if (typeof value === 'number') {
        const { min, max, step } = sliderRange(value, note?.range);
        controller = parent.add(target, key, min, max, step);
      } else if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
        controller = parent.addColor(target, key);
      } else {
        controller = parent.add(target, key);
      }
      controller.name(prettyLabel(key));
      if (note) controller.domElement.title = note.comment;
      controller.onChange((v: TuningValue) => {
        for (const listener of this.listeners) listener(path, v);
      });
      controller.listen();
    }
  }

  private async copyValues(): Promise<void> {
    const changes = diffValues(this.values, this.defaults);
    const text = formatCopyText(changes);
    const ok = await copyToClipboard(text);
    if (!ok) {
      showToast('Could not reach the clipboard. The values are printed in the browser console instead.');
      console.info(text);
      return;
    }
    showToast(
      changes.length === 0
        ? 'Nothing changed yet - everything is at its default.'
        : `Copied ${changes.length} changed value${changes.length === 1 ? '' : 's'}. Paste them to Claude.`,
    );
  }

  private resetAll(): void {
    const before = diffValues(this.values, this.defaults);
    assignValues(this.values, structuredClone(this.defaults));
    for (const change of before) {
      for (const listener of this.listeners) listener(change.path, change.from);
    }
    showToast('All tuning values reset to their defaults.');
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or the page was not focused: fall back to a hidden text box.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
