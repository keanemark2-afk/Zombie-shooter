/** The little "how to control this" box in the bottom-left. H shows or hides it. */
export class HelpOverlay {
  readonly element: HTMLDivElement;

  constructor(title: string, lines: Array<[string, string]>) {
    this.element = document.createElement('div');
    this.element.className = 'help-overlay';
    const rows = lines.map(([keys, action]) => `<tr><td class="keys">${keys}</td><td>${action}</td></tr>`).join('');
    this.element.innerHTML = `<div class="help-title">${title}</div><table>${rows}</table>`;
    document.body.appendChild(this.element);
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
  }
}
