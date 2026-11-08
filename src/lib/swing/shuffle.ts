// A shuffle bag: every eligible item comes up once per round, in a random order, never twice in a
// row, and not within the last two picks when there are enough others. Ineligible items (a pose that
// failed to load) are skipped without breaking the round.

export function createShuffleBag<T>(random: () => number = Math.random) {
  let bag: T[] = [];
  const recent: T[] = [];

  const refill = (eligible: readonly T[]) => {
    bag = [...eligible];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };

  return {
    /** The next pick among `eligible`, or null if there is none. */
    next(eligible: readonly T[]): T | null {
      if (eligible.length === 0) return null;
      bag = bag.filter((x) => eligible.includes(x));
      if (bag.length === 0) refill(eligible);
      const avoid = recent.slice(-(eligible.length > 2 ? 2 : eligible.length > 1 ? 1 : 0));
      let index = bag.findIndex((x) => !avoid.includes(x));
      if (index === -1) {
        // Only recent items are left in this round: start the next round, still avoiding them.
        refill(eligible);
        index = Math.max(
          0,
          bag.findIndex((x) => !avoid.includes(x)),
        );
      }
      const [pick] = bag.splice(index, 1);
      recent.push(pick);
      if (recent.length > 2) recent.shift();
      return pick;
    },
  };
}
