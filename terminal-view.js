import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { toTerminalText } from './terminal-text.js';
import {
  completeSimulatorCommand,
  getTerminalInputViewport,
  MAX_TERMINAL_LINE_LENGTH,
  TerminalLineBuffer,
  terminalCellWidth
} from './terminal-line.js';

const ANSI_RESET = '\u001b[0m';
const ANSI = {
  command: '\u001b[37m',
  default: '\u001b[90m',
  highlight: '\u001b[36m',
  path: '\u001b[34m',
  success: '\u001b[32m',
  user: '\u001b[92m',
  warn: '\u001b[33m'
};

const KEY_SEQUENCES = [
  ['\u001b[1;5D', 'word-left'],
  ['\u001b[1;5C', 'word-right'],
  ['\u001b[1;3D', 'word-left'],
  ['\u001b[1;3C', 'word-right'],
  ['\u001b[200~', 'paste-start'],
  ['\u001b[201~', 'paste-end'],
  ['\u001b[3~', 'delete'],
  ['\u001b[1~', 'home'],
  ['\u001b[4~', 'end'],
  ['\u001b[H', 'home'],
  ['\u001b[F', 'end'],
  ['\u001bOA', 'history-up'],
  ['\u001bOB', 'history-down'],
  ['\u001bOC', 'right'],
  ['\u001bOD', 'left'],
  ['\u001b[A', 'history-up'],
  ['\u001b[B', 'history-down'],
  ['\u001b[C', 'right'],
  ['\u001b[D', 'left'],
  ['\u007f', 'backspace'],
  ['\u0008', 'backspace'],
  ['\u0001', 'home'],
  ['\u0003', 'interrupt'],
  ['\u0004', 'eof'],
  ['\u0005', 'end'],
  ['\u0007', 'bell'],
  ['\u000c', 'clear-screen'],
  ['\u000f', 'redraw'],
  ['\u0015', 'delete-to-start'],
  ['\u0017', 'delete-word'],
  ['\t', 'tab']
].sort((left, right) => right[0].length - left[0].length);

export class TerminalView {
  constructor(container, { onCommand, getHistory, onEndOfInput, getPromptPath } = {}) {
    this.container = container;
    this.onCommand = onCommand || (() => {});
    this.getHistory = getHistory || (() => []);
    this.onEndOfInput = onEndOfInput || (() => {});
    this.getPromptPath = getPromptPath || (() => '~/projects/termbox');
    this.terminal = null;
    this.fitAddon = null;
    this.resizeObserver = null;
    this.resizeHandler = () => this.fit();
    this.webglAddon = null;
    this.dataSubscription = null;
    this.lineBuffer = new TerminalLineBuffer();
    this.promptActive = false;
    this.historyIndex = null;
    this.historyDraft = '';
    this.pasting = false;
  }

  mount() {
    this.terminal = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      disableStdin: false,
      fontFamily: 'SFMono-Regular, Cascadia Code, Roboto Mono, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.4,
      scrollback: 5000,
      screenReaderMode: true,
      theme: {
        background: '#090c10',
        foreground: '#aebbc7',
        cursor: '#7be6b2',
        selectionBackground: 'rgba(123, 230, 178, 0.24)',
        black: '#090c10',
        red: '#ff7d8d',
        green: '#7be6b2',
        yellow: '#ffb773',
        blue: '#6db8ff',
        magenta: '#bba2ff',
        cyan: '#8bc9e0',
        white: '#d7e1e8',
        brightBlack: '#566476',
        brightRed: '#ff9ca9',
        brightGreen: '#a2f2c7',
        brightYellow: '#ffd09a',
        brightBlue: '#91cbff',
        brightMagenta: '#cbbaff',
        brightCyan: '#a9e1ef',
        brightWhite: '#f4f7fb'
      }
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.container);
    this.configureInputElement();
    // Request bracketed paste so pasted line breaks are inserted as spaces, never submitted as commands.
    this.terminal.write('\u001b[?2004h');
    this.dataSubscription = this.terminal.onData((data) => this.handleInput(data));
    this.fit();

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this.resizeHandler, { passive: true });

    // WebGL is an optional acceleration path. xterm's DOM renderer remains the fallback.
    this.enableWebgl();
  }

  configureInputElement() {
    const input = this.container.querySelector('.xterm-helper-textarea');
    if (!input) return;
    input.setAttribute('aria-label', 'Terminal input — safe local simulator');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
  }

  promptPathText() {
    const path = String(this.getPromptPath() || '~');
    const fixedPromptWidth = Array.from('demo@termbox:$ ').reduce(
      (width, character) => width + terminalCellWidth(character),
      0
    );
    const maxPathWidth = Math.max(1, this.terminal.cols - fixedPromptWidth - 9);
    const pathCharacters = Array.from(path);
    const pathWidth = pathCharacters.reduce((width, character) => width + terminalCellWidth(character), 0);
    if (pathWidth <= maxPathWidth) return path;

    const suffixBudget = Math.max(0, maxPathWidth - 1);
    const visibleSuffix = [];
    let visibleWidth = 0;
    while (pathCharacters.length) {
      const character = pathCharacters.pop();
      const characterWidth = terminalCellWidth(character);
      if (visibleWidth + characterWidth > suffixBudget) break;
      visibleSuffix.unshift(character);
      visibleWidth += characterWidth;
    }
    return `…${visibleSuffix.join('')}`;
  }

  promptMarkup() {
    const isCompact = this.terminal.cols < 44;
    if (isCompact) return `${ANSI.user}tbx${ANSI_RESET}${ANSI.command}$ ${ANSI_RESET}`;
    return `${ANSI.user}demo@termbox${ANSI_RESET}:${ANSI.path}${toTerminalText(this.promptPathText())}${ANSI_RESET}${ANSI.command}$ ${ANSI_RESET}`;
  }

  promptWidth() {
    const prompt = this.terminal.cols < 44 ? 'tbx$ ' : `demo@termbox:${this.promptPathText()}$ `;
    return Array.from(prompt).reduce((width, character) => width + terminalCellWidth(character), 0);
  }

  showPrompt() {
    this.promptActive = true;
    this.renderInput();
  }

  renderInput() {
    if (!this.terminal || !this.promptActive) return;

    const promptWidth = this.promptWidth();
    const viewport = getTerminalInputViewport(this.lineBuffer, this.terminal.cols, promptWidth);
    const cellsAfterCursor = Math.max(0, viewport.width - viewport.cursorCells);
    const moveLeft = cellsAfterCursor > 0 ? `\u001b[${cellsAfterCursor}D` : '';
    this.terminal.write(`\r\u001b[2K${this.promptMarkup()}${toTerminalText(viewport.text)}\u001b[K${moveLeft}`);
    this.terminal.scrollToBottom();
  }

  writeLine(value = '', className = '') {
    if (!this.terminal) return;
    const color = ANSI[className] || ANSI.default;
    this.terminal.write(`${color}${toTerminalText(value)}${ANSI_RESET}\r\n`);
  }

  writeSpacer() {
    this.terminal?.write('\r\n');
  }

  clear() {
    this.terminal?.clear();
  }

  clearAndPrompt({ focus = true } = {}) {
    if (!this.terminal) return;
    this.terminal.clear();
    this.promptActive = true;
    this.renderInput();
    if (focus) this.focus();
  }

  scrollToBottom() {
    this.terminal?.scrollToBottom();
  }

  focus() {
    this.terminal?.focus();
  }

  executeCommand(command) {
    if (!this.terminal) return;
    this.promptActive = true;
    this.lineBuffer.setValue(command);
    this.resetHistoryNavigation();
    this.renderInput();
    this.submitLine();
  }

  insertText(value) {
    if (!this.promptActive) return;
    if (this.lineBuffer.insert(value)) {
      this.resetHistoryNavigation();
      this.renderInput();
    }
    this.focus();
  }

  handleVirtualKey(key) {
    const actions = {
      tab: () => this.completeInput(),
      enter: () => this.submitLine(),
      'ctrl-c': () => this.interruptInput(),
      'ctrl-l': () => this.clearAndPrompt(),
      escape: () => this.handleAction('escape'),
      up: () => this.historyUp(),
      down: () => this.historyDown(),
      '|': () => this.insertText('|'),
      '-': () => this.insertText('-'),
      '/': () => this.insertText('/'),
      '~': () => this.insertText('~')
    };
    actions[key]?.();
    this.focus();
  }

  handleInput(data) {
    if (!this.promptActive || typeof data !== 'string') return;

    let index = 0;
    let printable = '';
    let pendingCodePoints = 0;
    const flushPrintable = () => {
      if (!printable) return;
      if (this.lineBuffer.insert(printable)) {
        this.resetHistoryNavigation();
        this.renderInput();
      }
      printable = '';
      pendingCodePoints = 0;
    };
    const appendPrintable = (character) => {
      if (this.lineBuffer.characters.length + pendingCodePoints >= MAX_TERMINAL_LINE_LENGTH) return;
      printable += character;
      pendingCodePoints += 1;
    };

    while (index < data.length) {
      if (this.pasting) {
        const pasteEnd = '\u001b[201~';
        const endIndex = data.indexOf(pasteEnd, index);
        const pasteChunk = data.slice(index, endIndex === -1 ? data.length : endIndex);
        let pasteIndex = 0;
        while (
          pasteIndex < pasteChunk.length &&
          this.lineBuffer.characters.length + pendingCodePoints < MAX_TERMINAL_LINE_LENGTH
        ) {
          const codePoint = pasteChunk.codePointAt(pasteIndex);
          const character = String.fromCodePoint(codePoint);
          pasteIndex += character.length;
          if (character === '\r' || character === '\n' || character === '\t') {
            if (character === '\r' && pasteChunk[pasteIndex] === '\n') pasteIndex += 1;
            appendPrintable(' ');
          } else if (codePoint >= 0x20 && !(codePoint >= 0x7f && codePoint <= 0x9f)) {
            appendPrintable(character);
          }
        }
        index += pasteChunk.length;
        if (endIndex === -1) break;
        flushPrintable();
        this.pasting = false;
        index += pasteEnd.length;
        continue;
      }

      const match = KEY_SEQUENCES.find(([sequence]) => data.startsWith(sequence, index));
      if (match) {
        flushPrintable();
        this.handleAction(match[1]);
        index += match[0].length;
        continue;
      }

      const codePoint = data.codePointAt(index);
      const character = String.fromCodePoint(codePoint);
      index += character.length;

      if (character === '\u001b') {
        flushPrintable();
        const introducer = data[index];
        if (introducer === '[' || introducer === 'O') {
          index += 1;
          while (index < data.length) {
            const sequenceCode = data.charCodeAt(index);
            index += 1;
            if (sequenceCode >= 0x40 && sequenceCode <= 0x7e) break;
          }
        } else if (introducer === ']') {
          index += 1;
          while (index < data.length) {
            if (data[index] === '\u0007') {
              index += 1;
              break;
            }
            if (data.startsWith('\u001b\\', index)) {
              index += 2;
              break;
            }
            index += 1;
          }
        } else if (introducer === 'b' || introducer === 'B' || introducer === 'f' || introducer === 'F') {
          this.handleAction(introducer.toLowerCase() === 'b' ? 'word-left' : 'word-right');
          index += 1;
        } else if (introducer !== undefined) {
          index += 1;
        }
      } else if (character === '\r' || character === '\n') {
        flushPrintable();
        if (character === '\r' && data[index] === '\n') index += 1;
        this.submitLine();
      } else if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
        flushPrintable();
      } else {
        appendPrintable(character);
      }
    }

    flushPrintable();
  }

  handleAction(action) {
    switch (action) {
      case 'history-up':
        this.historyUp();
        break;
      case 'history-down':
        this.historyDown();
        break;
      case 'left':
        if (this.lineBuffer.moveLeft()) this.renderInput();
        break;
      case 'right':
        if (this.lineBuffer.moveRight()) this.renderInput();
        break;
      case 'word-left':
        if (this.lineBuffer.moveWordLeft()) this.renderInput();
        break;
      case 'word-right':
        if (this.lineBuffer.moveWordRight()) this.renderInput();
        break;
      case 'home':
        if (this.lineBuffer.moveToStart()) this.renderInput();
        break;
      case 'end':
        if (this.lineBuffer.moveToEnd()) this.renderInput();
        break;
      case 'backspace':
        if (this.lineBuffer.backspace()) this.renderInput();
        break;
      case 'delete':
        if (this.lineBuffer.deleteForward()) this.renderInput();
        break;
      case 'delete-to-start':
        if (this.lineBuffer.deleteToStart()) this.renderInput();
        break;
      case 'delete-to-end':
        if (this.lineBuffer.deleteToEnd()) this.renderInput();
        break;
      case 'delete-word':
        if (this.lineBuffer.deletePreviousWord()) this.renderInput();
        break;
      case 'tab':
        this.completeInput();
        break;
      case 'interrupt':
        this.interruptInput();
        break;
      case 'eof':
        this.handleEndOfInput();
        break;
      case 'clear-screen':
        this.clearAndPrompt();
        break;
      case 'redraw':
        this.renderInput();
        break;
      case 'paste-start':
        this.pasting = true;
        break;
      case 'paste-end':
        this.pasting = false;
        break;
      case 'escape':
      case 'bell':
      default:
        break;
    }
  }

  historyUp() {
    const history = this.getHistory();
    if (!history.length) return;

    if (this.historyIndex === null) {
      this.historyDraft = this.lineBuffer.value;
      this.historyIndex = history.length - 1;
    } else {
      this.historyIndex = Math.max(0, this.historyIndex - 1);
    }
    this.lineBuffer.setValue(history[this.historyIndex]);
    this.renderInput();
  }

  historyDown() {
    if (this.historyIndex === null) return;
    const history = this.getHistory();
    if (this.historyIndex < history.length - 1) {
      this.historyIndex += 1;
      this.lineBuffer.setValue(history[this.historyIndex]);
    } else {
      this.historyIndex = null;
      this.lineBuffer.setValue(this.historyDraft);
      this.historyDraft = '';
    }
    this.renderInput();
  }

  resetHistoryNavigation() {
    this.historyIndex = null;
    this.historyDraft = '';
  }

  completeInput() {
    const current = this.lineBuffer.value;
    const completion = completeSimulatorCommand(current);
    if (completion.value !== current) {
      this.lineBuffer.setValue(completion.value);
      this.resetHistoryNavigation();
      this.renderInput();
      return;
    }
    if (completion.matches.length > 1) {
      this.terminal.write('\r\n');
      this.writeLine(completion.matches.join('  '), 'highlight');
      this.renderInput();
      return;
    }
    if (completion.matches.length === 0) this.terminal.write('\u0007');
  }

  interruptInput() {
    this.lineBuffer.moveToEnd();
    this.renderInput();
    this.terminal.write('^C\r\n');
    this.lineBuffer.clear();
    this.resetHistoryNavigation();
    this.renderInput();
  }

  handleEndOfInput() {
    if (this.lineBuffer.value.length > 0) {
      if (this.lineBuffer.deleteForward()) this.renderInput();
      return;
    }
    this.terminal.write('\r\n');
    this.promptActive = false;
    this.onEndOfInput();
    this.promptActive = true;
    this.renderInput();
  }

  submitLine() {
    this.lineBuffer.moveToEnd();
    this.renderInput();
    const command = this.lineBuffer.value;
    this.terminal.write('\r\n');
    this.lineBuffer.clear();
    this.resetHistoryNavigation();
    this.promptActive = false;

    try {
      if (command.trim()) this.onCommand(command);
    } catch (error) {
      console.error('TermBox local command simulator failed.', error);
      this.writeLine('The local command simulator encountered an error.', 'warn');
    }

    this.promptActive = true;
    this.renderInput();
    this.scrollToBottom();
  }

  fit() {
    if (!this.fitAddon || !this.container.clientWidth || !this.container.clientHeight) return;
    this.fitAddon.fit();
    this.renderInput();
  }

  async enableWebgl() {
    try {
      const { WebglAddon } = await import('@xterm/addon-webgl');
      const addon = new WebglAddon();
      this.terminal.loadAddon(addon);
      addon.onContextLoss(() => {
        addon.dispose();
        if (this.webglAddon === addon) this.webglAddon = null;
        console.warn('TermBox terminal: WebGL context lost; using the DOM renderer.');
      });
      this.webglAddon = addon;
      this.fit();
    } catch (error) {
      console.warn('TermBox terminal: WebGL renderer unavailable; using the DOM renderer.', error);
    }
  }

  dispose() {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resizeHandler);
    this.dataSubscription?.dispose();
    this.webglAddon?.dispose();
    this.terminal?.dispose();
  }
}
