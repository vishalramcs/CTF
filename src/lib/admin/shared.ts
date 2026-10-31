// Safe for the browser: no env, no database.

export const STATUS_LABELS = {
  not_started: 'Not started',
  running: 'Running',
  paused: 'Paused',
  ended: 'Ended',
} as const;

export type EventStatus = keyof typeof STATUS_LABELS;

// docs/07 §2: the only moves an event can make.
export const TRANSITIONS = {
  start: { from: ['not_started'], to: 'running' },
  pause: { from: ['running'], to: 'paused' },
  resume: { from: ['paused'], to: 'running' },
  end: { from: ['running', 'paused'], to: 'ended' },
} as const;

export type TransitionAction = keyof typeof TRANSITIONS;

// docs/07 §3 and §4. Rewards are fixed by the rules; the admin only sees them.
export const DIFFICULTIES = {
  easy: { label: 'Easy', base: 60, reward: 180 },
  medium: { label: 'Medium', base: 110, reward: 330 },
  difficult: { label: 'Hard', base: 175, reward: 525 },
  main_difficult: { label: 'Main', base: 400, reward: 1200 },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;
export const LEVELS = Object.keys(DIFFICULTIES) as Difficulty[];

export const SURPRISE_KINDS = ['spidey_signal', 'flashy_spider', 'spider_mutation'] as const;
export type SurpriseKind = (typeof SURPRISE_KINDS)[number];

export const GENERATOR_KEYS = [
  'template',
  'exif-image',
  'log-file',
  'text-file',
  'placeholder',
] as const;

// The time zone is passed in, so the server and the browser render the same text.
export function formatTime(value: Date | string | null, timeZone: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

// Only https:// or a same-site /path may be served as a surprise asset.
export function isSafeAssetUrl(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('\\');
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
