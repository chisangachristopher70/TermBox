import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeSimulatorCommand,
  getTerminalInputViewport,
  MAX_TERMINAL_LINE_LENGTH,
  SIMULATOR_COMPLETIONS,
  TerminalLineBuffer,
  terminalCellWidth
} from '../terminal-line.js';

test('line buffer inserts at the cursor and supports left/right editing', () => {
  const line = new TerminalLineBuffer();
  line.insert('helo');
  line.moveLeft();
  line.insert('l');

  assert.equal(line.value, 'hello');
  assert.equal(line.cursor, 4);
  line.backspace();
  assert.equal(line.value, 'helo');
  line.deleteForward();
  assert.equal(line.value, 'hel');
  assert.equal(line.deleteForward(), false);
});

test('line buffer supports word movement and readline-style deletion', () => {
  const line = new TerminalLineBuffer();
  line.setValue('echo one two');

  assert.equal(line.moveWordLeft(), true);
  assert.equal(line.cursor, 9);
  assert.equal(line.moveWordLeft(), true);
  assert.equal(line.cursor, 5);
  assert.equal(line.moveWordRight(), true);
  assert.equal(line.cursor, 9);

  line.moveToEnd();
  line.deletePreviousWord();
  assert.equal(line.value, 'echo one ');
  assert.equal(line.cursor, 9);
  line.moveToEnd();
  line.deleteToStart();
  assert.equal(line.value, '');
  assert.equal(line.cursor, 0);
});

test('line buffer removes terminal control characters and treats graphemes as one edit unit', () => {
  const line = new TerminalLineBuffer();
  line.insert('a\u001b[2Jb\n\tcafe\u0301👩‍💻');

  assert.equal(line.value, 'a[2Jbcafe\u0301👩‍💻');
  line.setValue('e\u0301👩‍💻');
  assert.equal(line.characters.length, 2);
  line.backspace();
  assert.equal(line.value, 'e\u0301');
  line.backspace();
  assert.equal(line.value, '');
});

test('line buffer limits pasted input and never splits a grapheme at the limit', () => {
  const line = new TerminalLineBuffer();
  line.insert(`${'a'.repeat(MAX_TERMINAL_LINE_LENGTH - 1)}👩‍💻tail`);

  assert.equal(line.characters.length, MAX_TERMINAL_LINE_LENGTH);
  assert.equal(line.value.endsWith('👩‍💻'), true);
  assert.equal(line.insert('extra'), false);

  line.setValue(`${'x'.repeat(MAX_TERMINAL_LINE_LENGTH)}overflow`);
  assert.equal(line.characters.length, MAX_TERMINAL_LINE_LENGTH);
});

test('terminal cell width accounts for combining text, wide characters, emoji, and flags', () => {
  assert.equal(terminalCellWidth('a'), 1);
  assert.equal(terminalCellWidth('e\u0301'), 1);
  assert.equal(terminalCellWidth('\u0301'), 0);
  assert.equal(terminalCellWidth('\u200d'), 0);
  assert.equal(terminalCellWidth('\ufe0f'), 0);
  assert.equal(terminalCellWidth('界'), 2);
  assert.equal(terminalCellWidth('👩‍💻'), 2);
  assert.equal(terminalCellWidth('🇿🇲'), 2);
});

test('completion returns unique matches, expands common prefixes, and leaves unknown input unchanged', () => {
  const unique = completeSimulatorCommand('npm run b');
  assert.equal(unique.value, 'npm run build');
  assert.deepEqual(unique.matches, ['npm run build']);

  const directoryChange = completeSimulatorCommand('cd ~/');
  assert.equal(directoryChange.value, 'cd ~/projects/termbox');
  assert.deepEqual(directoryChange.matches, ['cd ~/projects/termbox']);

  const ambiguous = completeSimulatorCommand('ls');
  assert.equal(ambiguous.value, 'ls');
  assert.deepEqual(ambiguous.matches, ['ls', 'ls -la']);

  const unknown = completeSimulatorCommand('does-not-exist');
  assert.equal(unknown.value, 'does-not-exist');
  assert.deepEqual(unknown.matches, []);
  assert.ok(SIMULATOR_COMPLETIONS.includes('help'));
});

test('input viewport scrolls around the cursor and marks hidden text within terminal width', () => {
  const line = new TerminalLineBuffer();
  line.setValue('echo this is a long command');

  const atEnd = getTerminalInputViewport(line, 22, 5);
  assert.equal(atEnd.hiddenBefore, true);
  assert.equal(atEnd.hiddenAfter, false);
  assert.equal(atEnd.text.startsWith('<'), true);
  assert.ok(atEnd.width <= 16);
  assert.ok(atEnd.cursorCells <= atEnd.width);

  for (let index = 0; index < 10; index += 1) line.moveLeft();
  const inMiddle = getTerminalInputViewport(line, 22, 5);
  assert.equal(inMiddle.hiddenBefore, true);
  assert.equal(inMiddle.hiddenAfter, true);
  assert.equal(inMiddle.text.startsWith('<'), true);
  assert.equal(inMiddle.text.endsWith('>'), true);
  assert.ok(inMiddle.width <= 16);
  assert.ok(inMiddle.cursorCells <= inMiddle.width);

  line.moveToStart();
  const atStart = getTerminalInputViewport(line, 22, 5);
  assert.equal(atStart.hiddenBefore, false);
  assert.equal(atStart.hiddenAfter, true);
  assert.equal(atStart.text.endsWith('>'), true);
  assert.ok(atStart.width <= 16);
});

test('input viewport keeps double-width graphemes intact and handles narrow prompts', () => {
  const line = new TerminalLineBuffer();
  line.setValue('abc👩‍💻defgh');
  const viewport = getTerminalInputViewport(line, 12, 3);

  assert.equal(viewport.hiddenBefore, true);
  assert.equal(viewport.text.includes('👩‍💻'), true);
  assert.ok(viewport.width <= 8);
  assert.ok(viewport.cursorCells <= viewport.width);

  const veryNarrow = getTerminalInputViewport(line, 2, 50);
  assert.ok(veryNarrow.width <= 1);
});
