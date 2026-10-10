import test from 'node:test';
import assert from 'node:assert/strict';
import { toTerminalText } from '../terminal-text.js';

test('normalizes line endings and expands tabs for terminal output', () => {
  assert.equal(
    toTerminalText('one\r\ntwo\nthree\tend'),
    'one\r\ntwo\r\nthree    end'
  );
});

test('replaces control bytes so dynamic text cannot inject terminal commands', () => {
  const escape = String.fromCharCode(0x1b);
  const bell = String.fromCharCode(0x07);
  const result = toTerminalText(`text${escape}[2J${bell}`);

  assert.equal(result, 'text\uFFFD[2J\uFFFD');
  assert.equal(result.includes(escape), false);
});

test('converts non-string output without interpreting it', () => {
  assert.equal(toTerminalText(42), '42');
});
