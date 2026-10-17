let toastEl: HTMLDivElement | null = null;
let hideTimer = 0;

/** Shows a short message in the middle-bottom of the screen for a few seconds. */
export function showToast(message: string, seconds = 3): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => toastEl?.classList.remove('visible'), seconds * 1000);
}
