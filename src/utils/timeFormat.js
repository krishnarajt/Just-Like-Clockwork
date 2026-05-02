export function parseTimestamp(value) {
  if (value === null || value === undefined || value === 0 || value === '0' || value === '—') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const rawValue = String(value).trim();
  if (!rawValue) return null;

  const normalizedValue = rawValue
    .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, '$1T$2')
    .replace(/(\.\d{3})\d+/, '$1');

  const parsed = new Date(normalizedValue);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallbackParsed = new Date(rawValue);
  return Number.isNaN(fallbackParsed.getTime()) ? null : fallbackParsed;
}

export function formatLocalDateTime(value, options = {}) {
  const { fallback = '—', includeSeconds = false } = options;
  const date = parseTimestamp(value);
  if (!date) return value ? String(value) : fallback;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(date);
}

export function formatLocalDate(value, options = {}) {
  const { fallback = '—' } = options;
  const date = parseTimestamp(value);
  if (!date) return value ? String(value) : fallback;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatLocalTime(value, options = {}) {
  const { fallback = 'DNF', includeSeconds = false } = options;
  const date = parseTimestamp(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(date);
}

export function formatLocalDayAndDate(value) {
  const date = parseTimestamp(value) || new Date();

  return {
    day: new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date),
    date: formatLocalDate(date),
  };
}

export function formatSessionNameDateTime(value = new Date()) {
  const date = parseTimestamp(value) || new Date();
  return formatLocalDateTime(date);
}

export function formatDuration(totalSeconds = 0) {
  const secondsNumber = Number(totalSeconds);
  const normalizedSeconds = Number.isFinite(secondsNumber) ? Math.max(0, Math.round(secondsNumber)) : 0;
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}
