// Safe for the browser: no env, no database. docs/10.

export const PLAYBACK_LIMIT = 2;
// The server's own clock decides that a video can have finished: this much early is allowed, for
// buffering and clock rounding. It is not proof that anyone watched (docs/10 §5).
export const FINISH_TOLERANCE_SECONDS = 5;

export type FlashyOption = { id: string; label: string };

export type FlashyOutcome = 'correct' | 'wrong' | 'skipped';

export type FlashyTeamState =
  | { active: false }
  | {
      active: true;
      runId: string;
      // watch: the video is available. quiz: the server agrees it can have finished. done: finished.
      phase: 'watch' | 'quiz' | 'done';
      playbacksLeft: number;
      videoSeconds: number;
      question: string;
      options: FlashyOption[];
      outcome: FlashyOutcome | null;
    };

export const FLASHY_MESSAGES = {
  correct: {
    title: 'SPIDEY SENSE ACTIVATED!',
    body: 'Correct identification. Bonus points awarded!',
  },
  wrong: { title: 'Missed the signal!', body: 'Better luck next time.' },
  skipped: { title: 'Event skipped', body: 'Back to the mission.' },
} as const;
