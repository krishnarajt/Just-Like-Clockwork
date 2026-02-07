// Notification sound utility
// Plays a gentle chime using Web Audio API
// No external audio files needed

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a gentle two-tone chime notification
 */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext();

    // First tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 523.25; // C5
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.5);

    // Second tone (slightly delayed)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 659.25; // E5
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc2.start(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.7);

    // Third tone
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.frequency.value = 783.99; // G5
    osc3.type = 'sine';
    gain3.gain.setValueAtTime(0.2, ctx.currentTime + 0.4);
    gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc3.start(ctx.currentTime + 0.4);
    osc3.stop(ctx.currentTime + 1.0);
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}

/**
 * Show a browser notification (with permission)
 * @param {string} title
 * @param {string} body
 */
export async function showBrowserNotification(title, body) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/clockwork-icon.png' });
  }
}
