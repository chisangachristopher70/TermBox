import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { toTerminalText } from './terminal-text.js';

const ANSI_RESET = '\u001b[0m';
const ANSI = {
  command: '\u001b[37m',
  default: '\u001b[90m',
  highlight: '\u001b[36m',
  prompt: '\u001b[32m',
  path: '\u001b[34m',
  success: '\u001b[32m',
  warn: '\u001b[33m'
};

export class TerminalView {
  constructor(container) {
    this.container = container;
    this.terminal = null;
    this.fitAddon = null;
    this.resizeObserver = null;
    this.resizeHandler = () => this.fit();
    this.webglAddon = null;
  }

  mount() {
    this.terminal = new Terminal({
      allowTransparency: false,
      cursorBlink: false,
      // The separate command form remains attached to the simulator; no PTY exists yet.
      disableStdin: true,
      fontFamily: 'SFMono-Regular, Cascadia Code, Roboto Mono, Consolas, monospace',
      fontSize: 11,
      lineHeight: 1.45,
      scrollback: 5000,
      screenReaderMode: true,
      theme: {
        background: '#090c10',
        foreground: '#8290a0',
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
    this.fit();

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this.resizeHandler, { passive: true });

    // WebGL is an optional acceleration path. xterm's DOM renderer remains the fallback.
    this.enableWebgl();
  }

  writeLine(value = '', className = '') {
    const color = ANSI[className] || ANSI.default;
    this.terminal.write(`${color}${toTerminalText(value)}${ANSI_RESET}\r\n`);
  }

  writeCommand(value) {
    this.terminal.write(
      `${ANSI.prompt}›${ANSI_RESET} ${ANSI.path}~/projects/termbox${ANSI_RESET} ${ANSI.command}$ ${toTerminalText(value)}${ANSI_RESET}\r\n`
    );
  }

  writeSpacer() {
    this.terminal.write('\r\n');
  }

  clear() {
    this.terminal.clear();
  }

  scrollToBottom() {
    this.terminal.scrollToBottom();
  }

  fit() {
    if (!this.fitAddon || !this.container.clientWidth || !this.container.clientHeight) return;
    this.fitAddon.fit();
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
    this.webglAddon?.dispose();
    this.terminal?.dispose();
  }
}
