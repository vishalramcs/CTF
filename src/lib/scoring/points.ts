export type EventStatus = 'not_started' | 'running' | 'paused' | 'ended';
export type ChallengeAccess = 'open' | 'locked' | 'closed';

// docs/08 §2: 0.5 less per position up to the 5th, then 0.25 less, never below zero. The database
// trigger is the authority; this only shows a team what the next solve will be worth.
export function nextPoints(basePoints: number, priorSolves: number): number {
  const n = priorSolves + 1;
  const raw = n <= 5 ? basePoints - (n - 1) * 0.5 : basePoints - 2 - (n - 5) * 0.25;
  return Math.max(raw, 0);
}

// A challenge can be read once the event has started, and stays readable while paused.
export function challengeAccess(status: EventStatus): ChallengeAccess {
  if (status === 'not_started') return 'locked';
  return status === 'ended' ? 'closed' : 'open';
}

// docs/07 §2: submissions are accepted only while the event is running.
export function canSubmit(status: EventStatus, submissionsOpen: boolean): boolean {
  return status === 'running' && submissionsOpen;
}
