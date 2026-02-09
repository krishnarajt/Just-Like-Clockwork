import { useContext, useState, useEffect } from 'react';
import { LapContext } from '../context/LapContext';
import { AuthContext } from '../context/AuthContext';
import { playNotificationSound } from '../utils/notification';
import { Link } from 'react-router-dom';
import { syncAllSettingsToBackend, loadSettingsFromBackend, isLoggedIn } from '../utils/apiClient';
import { showToast } from '../utils/toast';

export default function Settings() {
  const {
    showAmount,
    updateShowAmount,
    showStatsBeforeLaps,
    updateShowStatsBeforeLaps,
    breaksImpactAmount,
    updateBreaksImpactAmount,
    breaksImpactTime,
    updateBreaksImpactTime,
    minimalistMode,
    updateMinimalistMode,
    notificationEnabled,
    updateNotificationEnabled,
    notificationIntervalHours,
    updateNotificationIntervalHours,
    amount,
    updateAmount,
  } = useContext(LapContext);

  const { loggedIn, backendOnline } = useContext(AuthContext);
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const [localAmount, setLocalAmount] = useState(amount || 450);

  useEffect(() => {
    if (amount) setLocalAmount(amount);
  }, [amount]);

  const handleAmountChange = (e) => {
    setLocalAmount(e.target.value);
    updateAmount(e.target.value);
  };

  const [localInterval, setLocalInterval] = useState(notificationIntervalHours);

  useEffect(() => {
    setLocalInterval(notificationIntervalHours);
  }, [notificationIntervalHours]);

  const handleIntervalChange = (e) => {
    const val = e.target.value;
    setLocalInterval(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      updateNotificationIntervalHours(num);
    }
  };

  // Save settings to backend
  const handleSaveToCloud = async () => {
    setSaving(true);
    try {
      const result = await syncAllSettingsToBackend();
      if (result) {
        showToast('Settings saved to cloud', 'success');
      } else {
        showToast('Failed to save settings — backend may be down', 'warning');
      }
    } catch {
      showToast('Failed to save settings', 'error');
    }
    setSaving(false);
  };

  // Load settings from backend
  const handleLoadFromCloud = async () => {
    setLoadingSettings(true);
    try {
      const result = await loadSettingsFromBackend();
      if (result) {
        // Refresh local state from localStorage (which was just updated)
        if (result.showAmount !== undefined) updateShowAmount(result.showAmount);
        if (result.showStatsBeforeLaps !== undefined) updateShowStatsBeforeLaps(result.showStatsBeforeLaps);
        if (result.breaksImpactAmount !== undefined) updateBreaksImpactAmount(result.breaksImpactAmount);
        if (result.breaksImpactTime !== undefined) updateBreaksImpactTime(result.breaksImpactTime);
        if (result.minimalistMode !== undefined) updateMinimalistMode(result.minimalistMode);
        if (result.notificationEnabled !== undefined) updateNotificationEnabled(result.notificationEnabled);
        if (result.notificationIntervalHours !== undefined) updateNotificationIntervalHours(result.notificationIntervalHours);
        if (result.hourlyAmount !== undefined) {
          setLocalAmount(result.hourlyAmount);
          updateAmount(result.hourlyAmount);
        }
        showToast('Settings loaded from cloud', 'success');
      } else {
        showToast('No cloud settings found', 'info');
      }
    } catch {
      showToast('Failed to load settings', 'error');
    }
    setLoadingSettings(false);
  };

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="btn btn-ghost btn-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5"/>
                <polyline points="12 19 5 12 12 5"/>
              </svg>
            </Link>
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>
          {/* Save/Load Cloud buttons right in the header when logged in */}
          {loggedIn && (
            <div className="flex gap-2">
              <button
                className={`btn btn-sm btn-primary gap-1 ${saving ? 'loading' : ''}`}
                onClick={handleSaveToCloud}
                disabled={saving || !backendOnline}
                title="Save settings to cloud"
              >
                {saving ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 16 12 12 8 16" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                )}
                Save to Cloud
              </button>
              <button
                className={`btn btn-sm btn-outline btn-secondary gap-1 ${loadingSettings ? 'loading' : ''}`}
                onClick={handleLoadFromCloud}
                disabled={loadingSettings || !backendOnline}
                title="Load settings from cloud"
              >
                {loadingSettings ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="8 17 12 21 16 17" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
                  </svg>
                )}
                Load from Cloud
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Display Section */}
          <div className="rounded-2xl border border-base-300 bg-base-200/30 p-6">
            <h2 className="text-xl font-semibold text-primary mb-4">Display</h2>

            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Show Amount</div>
                  <div className="text-sm text-base-content/60">Display earnings column in laps</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={showAmount}
                  onChange={() => updateShowAmount(!showAmount)}
                />
              </label>

              <div className="divider my-0"></div>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Show Stats Before Laps</div>
                  <div className="text-sm text-base-content/60">Move statistics section above the laps list</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={showStatsBeforeLaps}
                  onChange={() => updateShowStatsBeforeLaps(!showStatsBeforeLaps)}
                />
              </label>

              <div className="divider my-0"></div>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Minimalist Mode</div>
                  <div className="text-sm text-base-content/60">Clean view showing only the current lap and a larger timer. Previous laps collapse into an expandable section below.</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={minimalistMode}
                  onChange={() => updateMinimalistMode(!minimalistMode)}
                />
              </label>
            </div>
          </div>

          {/* Breaks Section */}
          <div className="rounded-2xl border border-base-300 bg-base-200/30 p-6">
            <h2 className="text-xl font-semibold text-warning mb-4">Breaks</h2>

            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Breaks Impact Time</div>
                  <div className="text-sm text-base-content/60">Exclude break laps from total time calculations</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-warning"
                  checked={breaksImpactTime}
                  onChange={() => updateBreaksImpactTime(!breaksImpactTime)}
                />
              </label>

              <div className="divider my-0"></div>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Breaks Impact Amount</div>
                  <div className="text-sm text-base-content/60">Exclude break laps from total amount calculations</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-warning"
                  checked={breaksImpactAmount}
                  onChange={() => updateBreaksImpactAmount(!breaksImpactAmount)}
                />
              </label>
            </div>
          </div>

          {/* Earnings Section */}
          <div className="rounded-2xl border border-base-300 bg-base-200/30 p-6">
            <h2 className="text-xl font-semibold text-success mb-4">Earnings</h2>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Hourly Amount (₹)</div>
                <div className="text-sm text-base-content/60">Rate used to calculate earnings per lap</div>
              </div>
              <input
                type="number"
                placeholder="Enter Hourly Amount"
                value={localAmount}
                onChange={handleAmountChange}
                className="input input-bordered w-32 text-right"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Notifications Section */}
          <div className="rounded-2xl border border-base-300 bg-base-200/30 p-6">
            <h2 className="text-xl font-semibold text-info mb-4">Notifications</h2>

            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Reminder Sound</div>
                  <div className="text-sm text-base-content/60">Play a notification sound at regular intervals while the app is open</div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-info"
                  checked={notificationEnabled}
                  onChange={() => updateNotificationEnabled(!notificationEnabled)}
                />
              </label>

              {notificationEnabled && (
                <>
                  <div className="divider my-0"></div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Interval (hours)</div>
                      <div className="text-sm text-base-content/60">How often to play the reminder sound</div>
                    </div>
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={localInterval}
                      onChange={handleIntervalChange}
                      className="input input-bordered w-28 text-right"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>

                  <div className="divider my-0"></div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Test Sound</div>
                      <div className="text-sm text-base-content/60">Preview the notification chime</div>
                    </div>
                    <button
                      className="btn btn-sm btn-info btn-outline"
                      onClick={() => playNotificationSound()}
                    >
                      Play Test
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cloud Sync Section — only shown when logged in */}
          {loggedIn && (
            <div className="rounded-2xl border border-info/30 bg-info/5 p-6">
              <h2 className="text-xl font-semibold text-info mb-2">Cloud Sync</h2>
              <p className="text-sm text-base-content/60 mb-4">
                Settings are saved locally automatically. Use cloud sync to share settings across browsers.
              </p>
              <div className="flex gap-3">
                <button
                  className={`btn btn-primary gap-2 ${saving ? 'loading' : ''}`}
                  onClick={handleSaveToCloud}
                  disabled={saving || !backendOnline}
                >
                  {saving ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 16 12 12 8 16" />
                      <line x1="12" y1="12" x2="12" y2="21" />
                      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                    </svg>
                  )}
                  Save to Cloud
                </button>
                <button
                  className={`btn btn-outline btn-secondary gap-2 ${loadingSettings ? 'loading' : ''}`}
                  onClick={handleLoadFromCloud}
                  disabled={loadingSettings || !backendOnline}
                >
                  {loadingSettings ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="8 17 12 21 16 17" />
                      <line x1="12" y1="12" x2="12" y2="21" />
                      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
                    </svg>
                  )}
                  Load from Cloud
                </button>
              </div>
              {!backendOnline && (
                <p className="text-xs text-error mt-2">Server is currently offline. Please try later.</p>
              )}
            </div>
          )}

          {/* Auto-save notice */}
          <div className="text-center text-sm text-base-content/40 pb-4">
            All settings are saved to this browser automatically.
            {!loggedIn && ' Log in to sync settings across devices.'}
          </div>
        </div>
      </div>
    </div>
  );
}
