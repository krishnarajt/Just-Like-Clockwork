// Simple toast notification utility
// Uses CSS classes defined in input.css for styling

let container = null;

function getContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {'info'|'warning'|'success'|'error'} type - Toast type for styling
 * @param {number} duration - Duration in ms before auto-removal (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
  const c = getContainer();
  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  toast.textContent = message;
  c.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, duration);
}
