// The one Spider-Man swing. Question clicks and the Ctrl+Alt+Shift+L shortcut both call playSwing();
// the overlay mounted in the root layout registers the only animation that runs.

type Runner = () => Promise<void>;

let runner: Runner | null = null;
let running: Promise<void> | null = null;

export function registerSwing(run: Runner): () => void {
  runner = run;
  return () => {
    if (runner === run) runner = null;
  };
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Plays the swing once. Resolves when it has finished (at once with reduced motion or before the
 * overlay mounts). Returns null while a swing is already playing, so callers can ignore the input.
 */
export function playSwing(): Promise<void> | null {
  if (running) return null;
  if (!runner || reducedMotion()) return Promise.resolve();
  running = runner().finally(() => {
    running = null;
  });
  return running;
}

type KeyLike = Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key' | 'code'>;

export function isSwingShortcut(e: KeyLike): boolean {
  // `code` covers layouts where Ctrl+Alt changes the produced character.
  return (
    e.ctrlKey &&
    e.altKey &&
    e.shiftKey &&
    !e.metaKey &&
    (e.code === 'KeyL' || e.key.toLowerCase() === 'l')
  );
}

type TargetLike = { tagName?: string; isContentEditable?: boolean } | null;

export function isTypingTarget(target: EventTarget | TargetLike): boolean {
  const t = target as TargetLike;
  if (!t) return false;
  if (t.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes((t.tagName ?? '').toUpperCase());
}
