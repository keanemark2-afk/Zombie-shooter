export type DeathChoice = 'retry' | 'menu';

/** The "you died" screen: a short summary and two buttons. */
export class DeathScreen {
  readonly root: HTMLDivElement;
  onChoose: (choice: DeathChoice) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'death-screen';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="death-title">YOU DIED</h1>
        <div class="death-summary"></div>
        <div class="menu-buttons">
          <button type="button" data-death="retry">Try again</button>
          <button type="button" data-death="menu">Main menu</button>
        </div>
        <div class="menu-note death-hint"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      const choice = btn?.dataset.death as DeathChoice | undefined;
      if (choice) this.onChoose(choice);
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** `lines` are plain text, one per row. `hint` shows the keys / pad buttons. */
  show(lines: string[], hint: string, title = 'YOU DIED'): void {
    (this.root.querySelector('.death-title') as HTMLElement).textContent = title;
    (this.root.querySelector('.death-summary') as HTMLElement).innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    (this.root.querySelector('.death-hint') as HTMLElement).textContent = hint;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
