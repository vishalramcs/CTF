// Client-safe: no database import, so admin and participant components can use it.
export const FRAGMENT_SLOTS = 6;
export const LOCATIONS = 3;

// docs/11. Slot (coordinate_order) 1-6 is the fragment identity: 1 L1-N, 2 L1-S, 3 L2-N, 4 L2-S,
// 5 L3-N, 6 L3-S. Which question carries which slot is the admin's choice.
export function fragmentId(order: number): string {
  return `L${Math.ceil(order / 2)}-${order % 2 === 1 ? 'N' : 'S'}`;
}
