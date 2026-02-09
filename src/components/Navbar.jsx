import { ClockIcon } from './ui/ClockIcon';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { LapContext } from '../context/LapContext';
import { AuthContext } from '../context/AuthContext';
import React, { useEffect } from 'react';

import uploadCSV from '../components/import/from_csv';
import uploadJSON from '../components/import/from_json';
import importBrowser from './import/from_local';
import exportCSV from '../components/export/to_csv';
import exportJSON from '../components/export/to_json';
import exportPDF from '../components/export/to_pdf';
import exportBrowser from './export/to_local';
import { ThemeContext } from '../context/ThemeContext';
import { themeChange } from 'theme-change'
import { copyCSVToClipboard } from '../utils/csvUtils';
import { getSyncQueue } from '../utils/apiClient';

const allColumns = [
  "ID",
  "Start Time",
  "End Time",
  "Elapsed Time",
  "Work Done",
  "Break",
  "Amount"
];

const themes = [
  "business",
  "forest",
  "nord",
  "corporate",
  "dracula",
  "light",
  "dark",
  "cupcake",
  "bumblebee",
  "emerald",
  "synthwave",
  "retro",
  "cyberpunk",
  "valentine",
  "halloween",
  "garden",
  "aqua",
  "lofi",
  "pastel",
  "fantasy",
  "wireframe",
  "black",
  "luxury",
  "cmyk",
  "autumn",
  "acid",
  "lemonade",
  "night",
  "coffee",
  "winter",
  "dim",
  "sunset",
  "caramellatte",
  "abyss",
  "silk"
];


export default function Navbar() {

  const [selectedCols, setSelectedCols] = useState([...allColumns]);
  const [copySuccess, setCopySuccess] = useState(false);

  const toggleColumn = (col) => {
    setSelectedCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const toggleAll = () => {
    if (selectedCols.length === allColumns.length) {
      setSelectedCols([]); // Uncheck all
    } else {
      setSelectedCols([...allColumns]); // Check all
    }
  };

  const { theme, setTheme } = React.useContext(ThemeContext);
  const { user, loggedIn, backendOnline, logout } = React.useContext(AuthContext);
  const syncQueueCount = getSyncQueue().length;
  useEffect(() => {
    themeChange(false);
  }, []);

  const { laps, getTotalAmountSum, getTotalTimeSpent, setLaps } =
    React.useContext(LapContext);

  const handleImportCSV = (laps) => {
    uploadCSV(laps)
    // console.log(laps);
    setLaps(laps);
  };

  const handleImportJSON = (laps) => {
    uploadJSON(laps)
    // console.log(laps);
    setLaps(laps);
  };

  const handleImportBrowser = async () => {
    await importBrowser();
  };

  const handleCopyCSV = async () => {
    const success = await copyCSVToClipboard(laps);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleExportCSV = async () => {
    exportCSV(laps);
  };

  const handleExportJSON = async () => {
    exportJSON(laps);
  };

  const handleExportPDF = async () => {
    exportPDF(laps, getTotalAmountSum(), getTotalTimeSpent(), laps.length);
  };

  const handleExportBrowser = async () => {
    exportBrowser(laps);
  };

  return (
    <div className="navbar bg-neutral px-2 py-2">
      <div className="flex-1">
        <div className="flex items-center">
          <ClockIcon className="w-14 h-14 text-neutral-content" />
          <Link to="/">
            <a className="btn btn-ghost text-2xl text-neutral-content">Just Like Clockwork</a>
          </Link>
        </div>
      </div>
      <div className="flex-none">
        <ul className="menu menu-horizontal px-1">
          {/* Import */}
          <div className="dropdown dropdown-center font-semibold">
            <div tabIndex={0} role="button" className="btn btn-neutral text-neutral-content text-xl font-normal">Import</div>
            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[50] w-52 p-2 shadow-sm w-fit">
              <li><a
                onClick={handleImportCSV}
              >CSV</a></li>
              <li><a
                onClick={handleImportJSON}
              >JSON</a></li>
              <li><a
                onClick={handleImportBrowser}
              >Browser</a></li>
            </ul>
          </div>
          {/* Export */}
          <div className="dropdown dropdown-center font-semibold">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-neutral text-neutral-content text-xl font-normal"
            >
              Export
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-100 rounded-box z-[50] w-64 p-4 shadow"
            >
              <legend className="fieldset-legend text-xl mb-2">Choose Columns</legend>
              <div className="flex flex-col gap-1 mb-4 max-h-48 overflow-y-auto pr-2 text-md">
                <label className="label cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary"
                    checked={selectedCols.length === allColumns.length}
                    onChange={toggleAll}
                  />
                  <span className="ml-2 text-base-content">All</span>
                </label>

                {allColumns.map((col) => (
                  <label key={col} className="label cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary"
                      checked={selectedCols.includes(col)}
                      onChange={() => toggleColumn(col)}
                    />
                    <span className="ml-2 text-base-content">{col}</span>
                  </label>
                ))}
              </div>

              <legend className="fieldset-legend text-xl mb-2">Choose Format</legend>
              <li className="text-md">
                <a onClick={handleCopyCSV}>
                  {copySuccess ? '✓ Copied!' : 'Clipboard CSV'}
                </a>
              </li>
              <li className="text-md"><a
                onClick={handleExportCSV}
              >CSV</a></li>
              <li className="text-md"><a
                onClick={handleExportJSON}
              >JSON</a></li>
              <li className="text-md"><a
                onClick={handleExportPDF}
              >PDF</a></li>
              <li className="text-md"><a
                onClick={handleExportBrowser}
              >Browser</a></li>
            </ul>
          </div>
          {/* Sessions */}
          <Link to="/sessions" className="btn btn-neutral text-neutral-content text-xl font-normal">Sessions</Link>
          {/* Settings */}
          <Link to="/settings" className="btn btn-neutral text-neutral-content text-xl font-normal">Settings</Link>
          {/* Themes */}
          <div className="dropdown dropdown-end" data-choose-theme>
            <div
              tabIndex={0}
              role="button"
              className="btn btn-neutral text-neutral-content text-xl font-normal"
            >
              Theme
              <svg
                width="12px"
                height="12px"
                className="inline-block h-2 w-2 fill-current opacity-60 ml-1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 2048 2048"
              >
                <path d="M1799 349l242 241-1017 1017L7 590l242-241 775 775 775-775z"></path>
              </svg>
            </div>

            <ul
              tabIndex={0}
              className="dropdown-content bg-base-300 rounded-box z-[50] p-4 shadow-2xl max-h-96 overflow-y-auto"
              data-choose-theme
            >
              {themes.map((t) => (
                <li key={t}>
                  <input
                    type="radio"
                    name="theme-dropdown"
                    className="theme-controller w-full btn btn-sm btn-block btn-ghost justify-start text-lg capitalize"
                    aria-label={t}
                    value={t}
                    checked={theme === t}
                    onChange={() => setTheme(t)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </ul>
          {/* Auth */}
          {loggedIn ? (
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-neutral text-neutral-content text-xl font-normal gap-2"
              >
                {/* User icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {user || 'Account'}
                {/* Backend status dot */}
                <span
                  className={`w-2 h-2 rounded-full ${
                    backendOnline === true
                      ? 'bg-success'
                      : backendOnline === false
                      ? 'bg-error'
                      : 'bg-warning'
                  }`}
                  title={
                    backendOnline === true
                      ? 'Server online'
                      : backendOnline === false
                      ? 'Server offline'
                      : 'Checking server...'
                  }
                />
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-[50] w-56 p-3 shadow-lg border border-base-300"
              >
                <li className="menu-title text-xs text-base-content/50 px-2 pb-1">
                  Signed in as <span className="font-semibold text-base-content">{user}</span>
                </li>
                <li className="menu-title text-xs px-2 pb-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        backendOnline ? 'bg-success' : 'bg-error'
                      }`}
                    />
                    {backendOnline ? 'Server online' : 'Server offline'}
                    {syncQueueCount > 0 && (
                      <span className="text-warning">({syncQueueCount} pending sync)</span>
                    )}
                  </span>
                </li>
                <div className="divider my-0"></div>
                <li>
                  <a
                    onClick={logout}
                    className="text-error hover:bg-error/10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </a>
                </li>
              </ul>
            </div>
          ) : (
            <Link
              to="/login"
              className="btn btn-neutral text-neutral-content text-xl font-normal gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Login
            </Link>
          )}
      </div>
    </div>
  );
}
