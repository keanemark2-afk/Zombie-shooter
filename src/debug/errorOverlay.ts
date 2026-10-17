// If anything breaks while playing, show the error on screen in plain words
// (with a copy button) instead of failing silently.

let overlay: HTMLDivElement | null = null;
let textEl: HTMLPreElement | null = null;

export function showError(title: string, details: string): void {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'error-overlay';
    overlay.innerHTML = `
      <h2></h2>
      <p>Please copy this and send it to Claude:</p>
      <pre></pre>
      <div class="error-buttons">
        <button type="button" data-action="copy">Copy error</button>
        <button type="button" data-action="close">Close</button>
      </div>`;
    textEl = overlay.querySelector('pre');
    overlay.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).dataset.action;
      if (action === 'copy' && textEl) void navigator.clipboard?.writeText(textEl.textContent ?? '');
      if (action === 'close') overlay?.remove();
    });
  }
  overlay.querySelector('h2')!.textContent = title;
  const previous = textEl!.textContent ? `${textEl!.textContent}\n\n` : '';
  textEl!.textContent = `${previous}${details}`.slice(-6000);
  if (!overlay.isConnected) document.body.appendChild(overlay);
}

export function installErrorOverlay(): void {
  window.addEventListener('error', (e) => {
    const where = e.filename ? `\n  at ${e.filename}:${e.lineno}:${e.colno}` : '';
    const stack = e.error instanceof Error && e.error.stack ? `\n${e.error.stack}` : where;
    showError('Something went wrong', `${e.message}${stack}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack ?? ''}` : String(e.reason);
    showError('Something went wrong', reason);
  });
}
