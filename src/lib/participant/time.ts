const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

// UI times are always IST (CLAUDE.md conventions).
export const formatDateTimeIST = (iso: string | Date) => `${IST.format(new Date(iso))} IST`;
