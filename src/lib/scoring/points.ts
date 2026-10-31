export type EventStatus = 'not_started' | 'running' | 'paused' | 'ended';
export type ChallengeAccess = 'open' | 'locked' | 'closed';

// docs/07 §3: base minus 0.5 per earlier solve, never below zero. The database trigger is the
// authority; this only shows a team what the next solve will be worth.
export function nextPoints(basePoints: number, priorSolves: number): number {
  return Math.max(basePoints - 0.5 * priorSolves, 0);
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
