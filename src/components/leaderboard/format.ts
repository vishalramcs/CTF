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
