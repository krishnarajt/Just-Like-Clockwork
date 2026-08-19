// Persists the in-progress laps. Called from an effect that re-runs every
// second while the timer is ticking, so a throw here is not survivable: with no
// ErrorBoundary in the tree an uncaught quota error unmounts the app and the
// running lap stops being saved entirely. Base64 image attachments share this
// origin's quota and are what fills it, so this is reachable in normal use.
function saveToLocalStorage(laps) {
  try {
    localStorage.setItem('laps', JSON.stringify(laps));
    return true;
  } catch (e) {
    console.warn('Failed to persist laps to localStorage:', e);
    return false;
  }
}

export { saveToLocalStorage as default };
