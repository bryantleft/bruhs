// How one digit wheel turns. A wheel is a column of 0 to 9 drawn twice, rows 0 to 19, and rests
// on row `digit`. Every place turns the way the whole figure moved, so 19 to 20 rolls the ones
// up from 9 through to 0 rather than back down past 8. `start` is the row the wheel jumps to
// first (it shows the same digit as the rest row) and `end` the row it rolls to.
export function wheelTurn(
  from: number,
  digit: number,
  up: boolean,
): Readonly<{ start: number; end: number }> {
  if (up) return { start: from, end: digit >= from ? digit : digit + 10 };
  return { start: from + 10, end: digit <= from ? digit + 10 : digit };
}

// The digit at each place, counted from the right, so the ones stay the ones when a figure
// grows a place. Separators ("1,234", "12.3k") keep their own places and never turn.
export function placeFromRight(text: string, place: number): string | undefined {
  return text[text.length - 1 - place];
}

export function isDigit(char: string | undefined): char is string {
  return char !== undefined && char >= '0' && char <= '9';
}
