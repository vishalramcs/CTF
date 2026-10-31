// docs/07 §2 and docs/08 §8: the login username is the team name, and the password is the team
// name lowercased, spaces removed, reversed.
// shortcut: the password is derivable from the public team name. The organisers accept this; use
// an organiser-printed secret if that is ever not acceptable.
export function teamPassword(teamName: string): string {
  return [...teamName.toLowerCase().replace(/\s+/g, '')].reverse().join('');
}
