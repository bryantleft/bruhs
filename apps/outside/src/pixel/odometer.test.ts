import assert from 'node:assert/strict';
import test from 'node:test';
import { isDigit, placeFromRight, wheelTurn } from './odometer.ts';

test('a wheel turns the way the whole figure moved, never back past its own digits', () => {
  // 13 to 16: the ones roll up three rows.
  assert.deepEqual(wheelTurn(3, 6, true), { start: 3, end: 6 });
  // 19 to 20: the ones roll up from 9 to 0, one row, not nine rows down.
  assert.deepEqual(wheelTurn(9, 0, true), { start: 9, end: 10 });
  // 20 to 19: the ones roll down from 0 to 9, one row.
  assert.deepEqual(wheelTurn(0, 9, false), { start: 10, end: 9 });
  // 16 to 13: down three rows.
  assert.deepEqual(wheelTurn(6, 3, false), { start: 16, end: 13 });
  // A place that didn't change stays put, either way.
  assert.deepEqual(wheelTurn(4, 4, true), { start: 4, end: 4 });
  assert.deepEqual(wheelTurn(4, 4, false), { start: 14, end: 14 });
  // Every start shows the same digit as the rest row, so the jump before a roll is invisible.
  for (let from = 0; from <= 9; from++) {
    for (let digit = 0; digit <= 9; digit++) {
      for (const up of [true, false]) {
        const { start, end } = wheelTurn(from, digit, up);
        assert.equal(start % 10, from);
        assert.equal(end % 10, digit);
        assert.ok(start >= 0 && start <= 19 && end >= 0 && end <= 19);
        assert.ok(up ? end >= start : end <= start);
        assert.ok(Math.abs(end - start) <= 9);
      }
    }
  }
});

test('places are counted from the right, so separators and new places line up', () => {
  assert.equal(placeFromRight('1,234', 0), '4');
  assert.equal(placeFromRight('1,234', 3), ',');
  assert.equal(placeFromRight('999', 3), undefined);
  assert.equal(placeFromRight('12.3k', 0), 'k');
  assert.ok(isDigit('0') && isDigit('9'));
  assert.ok(!isDigit(',') && !isDigit('k') && !isDigit(undefined));
});
