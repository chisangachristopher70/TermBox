const MARK_CHARACTER = /\p{Mark}/u;
export const MAX_TERMINAL_LINE_LENGTH = 8192;
const GRAPHEME_SEGMENTER = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export const SIMULATOR_COMPLETIONS = Object.freeze([
  'cd ',
  'cd ..',
  'cd ~',
  'cd ~/projects/termbox',
  'clear',
  'date',
  'echo ',
  'git log --oneline',
  'git status',
  'gui',
  'help',
  'history',
  'ls',
  'ls -la',
  'neofetch',
  'node --version',
  'npm --version',
  'npm run build',
  'npm run dev',
  'pkg install curl',
  'pkg install jq',
  'pkg update',
  'pwd',
  'python3 --version',
  'whoami'
]);

function* graphemes(value) {
  const text = String(value);
  if (GRAPHEME_SEGMENTER) {
    for (const segment of GRAPHEME_SEGMENTER.segment(text)) yield segment.segment;
    return;
  }
  yield* text;
}

function isPrintable(character) {
  const codePoint = character.codePointAt(0);
  return codePoint >= 0x20 &&
    !(codePoint >= 0x7f && codePoint <= 0x9f) &&
    codePoint !== 0x2028 &&
    codePoint !== 0x2029;
}

function sanitizeInput(value, limit) {
  if (limit <= 0) return [];
  const characters = [];
  for (const character of graphemes(value)) {
    if (isPrintable(character)) characters.push(character);
    if (characters.length >= limit) break;
  }
  return characters;
}

export class TerminalLineBuffer {
  constructor() {
    this.characters = [];
    this.cursor = 0;
  }

  get value() {
    return this.characters.join('');
  }

  insert(value) {
    const available = MAX_TERMINAL_LINE_LENGTH - this.characters.length;
    const characters = sanitizeInput(value, available);
    if (!characters.length) return false;
    this.characters.splice(this.cursor, 0, ...characters);
    this.cursor += characters.length;
    return true;
  }

  setValue(value) {
    this.characters = sanitizeInput(value, MAX_TERMINAL_LINE_LENGTH);
    this.cursor = this.characters.length;
  }

  backspace() {
    if (this.cursor === 0) return false;
    this.characters.splice(this.cursor - 1, 1);
    this.cursor -= 1;
    return true;
  }

  deleteForward() {
    if (this.cursor >= this.characters.length) return false;
    this.characters.splice(this.cursor, 1);
    return true;
  }

  moveLeft() {
    if (this.cursor === 0) return false;
    this.cursor -= 1;
    return true;
  }

  moveRight() {
    if (this.cursor >= this.characters.length) return false;
    this.cursor += 1;
    return true;
  }

  moveToStart() {
    if (this.cursor === 0) return false;
    this.cursor = 0;
    return true;
  }

  moveToEnd() {
    if (this.cursor === this.characters.length) return false;
    this.cursor = this.characters.length;
    return true;
  }

  deleteToStart() {
    if (this.cursor === 0) return false;
    this.characters.splice(0, this.cursor);
    this.cursor = 0;
    return true;
  }

  deleteToEnd() {
    if (this.cursor === this.characters.length) return false;
    this.characters.splice(this.cursor);
    return true;
  }

  deletePreviousWord() {
    if (this.cursor === 0) return false;
    const end = this.cursor;
    while (this.cursor > 0 && /^\s$/u.test(this.characters[this.cursor - 1])) this.cursor -= 1;
    while (this.cursor > 0 && !/^\s$/u.test(this.characters[this.cursor - 1])) this.cursor -= 1;
    this.characters.splice(this.cursor, end - this.cursor);
    return true;
  }

  moveWordLeft() {
    if (this.cursor === 0) return false;
    while (this.cursor > 0 && /^\s$/u.test(this.characters[this.cursor - 1])) this.cursor -= 1;
    while (this.cursor > 0 && !/^\s$/u.test(this.characters[this.cursor - 1])) this.cursor -= 1;
    return true;
  }

  moveWordRight() {
    if (this.cursor >= this.characters.length) return false;
    while (this.cursor < this.characters.length && !/^\s$/u.test(this.characters[this.cursor])) this.cursor += 1;
    while (this.cursor < this.characters.length && /^\s$/u.test(this.characters[this.cursor])) this.cursor += 1;
    return true;
  }

  clear() {
    const changed = this.characters.length > 0;
    this.characters = [];
    this.cursor = 0;
    return changed;
  }
}

export function terminalCellWidth(character) {
  const codePoints = Array.from(character, (part) => part.codePointAt(0));
  const isZeroWidth = (codePoint) => MARK_CHARACTER.test(String.fromCodePoint(codePoint)) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f);
  if (!codePoints.length || codePoints.every(isZeroWidth)) return 0;

  const isWide = (codePoint) =>
    (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) ||
    (codePoint >= 0x1100 && (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f000 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    ));

  if (codePoints.some(isWide) || codePoints.includes(0xfe0f)) return 2;
  return 1;
}

function widthOf(characters, start, end) {
  let width = 0;
  for (let index = start; index < end; index += 1) {
    width += terminalCellWidth(characters[index]);
  }
  return width;
}

export function getTerminalInputViewport(lineBuffer, columns, promptWidth) {
  const characters = lineBuffer.characters;
  const cursor = lineBuffer.cursor;
  const available = Math.max(1, Math.floor(columns) - Math.ceil(promptWidth) - 1);
  const cursorWidthFromStart = widthOf(characters, 0, cursor);
  let start = 0;

  if (cursorWidthFromStart > available) {
    const rightMarkerBudget = cursor < characters.length ? 1 : 0;
    const beforeCursorBudget = Math.max(0, available - 1 - rightMarkerBudget);
    let visibleBeforeCursor = 0;
    start = cursor;
    while (start > 0) {
      const characterWidth = terminalCellWidth(characters[start - 1]);
      if (visibleBeforeCursor + characterWidth > beforeCursorBudget) break;
      visibleBeforeCursor += characterWidth;
      start -= 1;
    }
  }

  const hasLeftMarker = start > 0;
  let displayWidth = (hasLeftMarker ? 1 : 0) + widthOf(characters, start, cursor);
  let end = cursor;

  while (end < characters.length) {
    const characterWidth = terminalCellWidth(characters[end]);
    const reserveRightMarker = end + 1 < characters.length ? 1 : 0;
    if (displayWidth + characterWidth + reserveRightMarker > available) break;
    displayWidth += characterWidth;
    end += 1;
  }

  const hasRightMarker = end < characters.length && displayWidth < available;
  const visibleCharacters = characters.slice(start, end);
  const text = `${hasLeftMarker ? '<' : ''}${visibleCharacters.join('')}${hasRightMarker ? '>' : ''}`;
  return {
    text,
    cursorCells: (hasLeftMarker ? 1 : 0) + widthOf(characters, start, cursor),
    width: displayWidth + (hasRightMarker ? 1 : 0),
    hiddenBefore: hasLeftMarker,
    hiddenAfter: end < characters.length
  };
}

export function completeSimulatorCommand(line, suggestions = SIMULATOR_COMPLETIONS) {
  const matches = suggestions.filter((suggestion) => suggestion.startsWith(line));
  if (line.length === 0 || matches.length === 0) return { value: line, matches };

  let commonPrefix = Array.from(matches[0]);
  for (const match of matches.slice(1)) {
    const candidate = Array.from(match);
    let index = 0;
    while (index < commonPrefix.length && commonPrefix[index] === candidate[index]) index += 1;
    commonPrefix = commonPrefix.slice(0, index);
  }

  const commonValue = commonPrefix.join('');
  return {
    value: commonValue.length > line.length ? commonValue : (matches.length === 1 ? matches[0] : line),
    matches
  };
}
