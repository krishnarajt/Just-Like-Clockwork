import { useContext, useState, useEffect } from 'react';
import { LapContext } from '../context/LapContext';
import { playNotificationSound } from '../utils/notification';
import { Link } from 'react-router-dom';

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

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/" className="btn btn-ghost btn-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </Link>
          <h1 className="text-3xl font-bold">Settings</h1>
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
        </div>
      </div>
    </div>
  );
}
