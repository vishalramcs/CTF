const POINTS = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

// Fractions show as 47.75; whole points without a trailing .0.
export const formatPoints = (n: number) => POINTS.format(n);

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
export const formatTimeIST = (iso: string) => IST.format(new Date(iso));

const IST_SECONDS = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
export const formatClockIST = (iso: string) => IST_SECONDS.format(new Date(iso));

// Challenges solved, Main Question included. Matches `solves` in app.v_scoreboard.
export const solvedCount = (row: {
  easySolved: number;
  mediumSolved: number;
  difficultSolved: number;
  mainDone: boolean;
}) => row.easySolved + row.mediumSolved + row.difficultSolved + (row.mainDone ? 1 : 0);
