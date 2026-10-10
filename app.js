import { SampleFileSystem } from './simulator-filesystem.js';

/* TermBox bundles its dependencies locally so the production build can be deployed as a
   static site without remote scripts. The command adapter below is a browser-safe simulator,
   not a remote command runner. */

/* Apply layout values from data attributes via the CSSOM. Inline style="" attributes are
   avoided so the production Content-Security-Policy can forbid 'unsafe-inline' styles. */
document.querySelectorAll('[data-width]').forEach((element) => {
  element.style.width = element.dataset.width;
});
document.querySelectorAll('[data-height]').forEach((element) => {
  element.style.height = element.dataset.height;
});

const iconPaths = {
  terminal: '<path d="m5 7 4 4-4 4"/><path d="M11.5 15H16"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/>',
  package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  pulse: '<path d="M3 12h3l2-6 4 12 2-6h7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  git: '<circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 7h3a5 5 0 0 1 5 5v3M7 9v5a3 3 0 0 0 3 3h5"/>',
  code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
  upload: '<path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 0 1 0 9Z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  trash: '<path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 5.5v16M8 7h8M8 11h8"/>'
};

const iconMarkup = (name, extraClass = '') => `<svg class="${extraClass}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ''}</svg>`;

document.querySelectorAll('[data-icon]').forEach((element) => {
  const name = element.dataset.icon;
  element.innerHTML = iconMarkup(name);
});

const viewIds = ['terminal', 'gui', 'files', 'packages', 'activity'];
const viewLabels = {
  terminal: 'terminal',
  gui: 'gui-workspace',
  files: 'files',
  packages: 'packages',
  activity: 'activity'
};
let currentView = 'terminal';
let commandHistory = [];
let toastTimer;
const sampleFilesystem = new SampleFileSystem();

const terminalOutput = document.getElementById('terminalOutput');
const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');
const toastRegion = document.querySelector('.toast-region');
const paletteBackdrop = document.getElementById('paletteBackdrop');
const paletteInput = document.getElementById('paletteInput');
const paletteResults = document.getElementById('paletteResults');
let terminalView;
let terminalViewReady;

function appendLine(text = '', type = 'output', className = '') {
  if (!terminalView) return;
  terminalView.writeLine(text, className || (type === 'command' ? 'command' : ''));
}

function appendSpacer() {
  terminalView?.writeSpacer();
}

function bootTerminal() {
  terminalView.clear();
  appendLine('TermBox local terminal simulator', 'output', 'highlight');
  appendLine('Type `help` to browse the available demo commands.', 'output');
  appendLine('No operating-system process or remote session is attached.', 'output', 'warn');
  appendSpacer();
  terminalView.showPrompt();
  terminalView.scrollToBottom();
}

function clearTerminal() {
  if (!terminalView) {
    terminalViewReady?.then((ready) => {
      if (ready) clearTerminal();
    });
    return;
  }
  terminalView.clearAndPrompt({ focus: currentView === 'terminal' });
}

function printLines(lines, type = 'output') {
  lines.forEach((line) => appendLine(line.text || line, line.type || type, line.className || ''));
}

function printSampleListing(command) {
  const argumentsList = command.trim().split(/\s+/).slice(1);
  const options = argumentsList.filter((argument) => argument.startsWith('-'));
  const target = argumentsList.find((argument) => !argument.startsWith('-')) || '.';
  const listing = sampleFilesystem.list(target);

  if (!listing) {
    appendLine(`ls: ${target}: no such path in the sample workspace`, 'output', 'warn');
    return;
  }

  appendLine(`sample listing for ${sampleFilesystem.promptPath(listing.path)} — no host filesystem is read`, 'output', 'warn');
  const showHidden = options.some((option) => option.slice(1).includes('a'));
  const entries = listing.entries.filter((entry) => showHidden || !entry.name.startsWith('.'));
  const longFormat = options.some((option) => option.slice(1).includes('l'));
  if (longFormat) {
    entries.forEach((entry) => {
      const mode = entry.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--';
      appendLine(`${mode}  demo  demo  ${entry.name}${entry.type === 'directory' ? '/' : ''}`, 'output');
    });
  } else {
    appendLine(entries.map((entry) => `${entry.name}${entry.type === 'directory' ? '/' : ''}`).join('  ') || '(empty directory)', 'output', 'highlight');
  }
}

function changeSampleDirectory(command) {
  let target = command.trim().slice(2).trim();
  if (!target) target = '~';
  if ((target.startsWith('"') && target.endsWith('"')) || (target.startsWith("'") && target.endsWith("'"))) {
    target = target.slice(1, -1);
  }

  const result = sampleFilesystem.changeDirectory(target);
  if (!result.ok) {
    appendLine(`cd: ${target}: no such directory in the sample workspace`, 'output', 'warn');
    return false;
  }
  return true;
}

function commandResponse(rawCommand) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase();
  if (!command) return;

  if (lower === 'clear' || lower === 'cls') {
    terminalView?.clear();
    return;
  }

  if (lower === 'help' || lower === 'termbox --help') {
    printLines([
      { text: 'TermBox commands', className: 'highlight' },
      '  help                 show this list',
      '  ls [-la]             list sample workspace files',
      '  cd <path>            change sample directory',
      '  pwd                  print current sample directory',
      '  neofetch             show workspace information',
      '  gui                  switch to GUI mode',
      '  clear                clear the terminal',
      '  pkg <command>        simulate package actions',
      '  npm run <script>     simulate a project script',
      '  echo <text>          print a message',
      '  date                 print the current date'
    ]);
  } else if (lower === 'cd' || lower.startsWith('cd ')) {
    changeSampleDirectory(command);
    return;
  } else if (lower === 'pwd') {
    printLines([
      { text: 'sample path — no host filesystem is attached', className: 'warn' },
      sampleFilesystem.cwd
    ]);
  } else if (lower === 'whoami') {
    appendLine('demo', 'output', 'highlight');
  } else if (lower === 'ls' || lower.startsWith('ls ')) {
    printSampleListing(command);
  } else if (lower === 'neofetch') {
    printLines([
      { text: '  TermBox local preview', className: 'highlight' },
      '  ─────────────────────',
      '  OS       not attached',
      '  Host     browser tab',
      '  Kernel   unavailable',
      '  Runtime  command simulator'
    ]);
  } else if (lower === 'date') {
    appendLine(new Date().toString(), 'output', 'highlight');
  } else if (lower === 'npm -v' || lower === 'npm --version' || lower === 'node -v' || lower === 'node --version' || lower === 'python --version' || lower === 'python3 --version') {
    appendLine('No language runtime is attached to this local simulator.', 'output', 'warn');
  } else if (lower === 'git status') {
    printLines([
      { text: 'No Git working tree is attached.', className: 'warn' },
      'This preview does not inspect the repository on disk.'
    ]);
  } else if (lower === 'git log' || lower === 'git log --oneline') {
    appendLine('No Git repository is attached to this simulator.', 'output', 'warn');
  } else if (lower === 'npm run dev' || lower === 'npm run build') {
    printLines([
      { text: `> ${command}`, className: 'highlight' },
      'Simulation only: no script ran and no files or processes changed.'
    ]);
  } else if (lower === 'pkg update' || lower === 'apt update') {
    appendLine('Simulation only: no package index was contacted.', 'output', 'warn');
  } else if (lower.startsWith('pkg install ') || lower.startsWith('apt install ')) {
    const packageName = command.split(/\s+/).slice(2).join(' ') || 'package';
    appendLine(`Simulation only: ${packageName} was not downloaded or installed.`, 'output', 'warn');
  } else if (lower === 'exit') {
    appendLine('This simulator has no shell process to exit.', 'output', 'warn');
  } else if (lower === 'gui' || lower === 'termbox gui') {
    appendLine('Opening the visual workspace...', 'output', 'success');
    setTimeout(() => setView('gui'), 220);
  } else if (lower.startsWith('echo ')) {
    appendLine(command.slice(5), 'output', 'highlight');
  } else if (lower === 'echo') {
    appendLine('', 'output');
  } else if (lower === 'history') {
    if (!commandHistory.length) appendLine('No commands in history.', 'output');
    commandHistory.forEach((item, index) => appendLine(`${String(index + 1).padStart(3, ' ')}  ${item}`, 'output'));
  } else {
    appendLine(`termbox: ${command.split(/\s+/)[0]}: command not found in this simulator`, 'output', 'warn');
    appendLine("Type 'help' for available TermBox commands.", 'output');
  }

  appendSpacer();
  terminalView?.scrollToBottom();
}

function handleTerminalCommand(rawCommand) {
  const command = rawCommand.trim();
  if (!command) return;
  commandHistory = commandHistory.filter((item) => item !== command);
  commandHistory.push(command);
  if (commandHistory.length > 200) commandHistory.shift();
  commandResponse(command);
}

function runCommand(rawCommand) {
  if (!terminalView) {
    terminalViewReady?.then((ready) => {
      if (ready) runCommand(rawCommand);
    });
    return;
  }
  const command = String(rawCommand).trim();
  if (!command) {
    terminalView.focus();
    return;
  }
  terminalView.executeCommand(command);
}

function setView(view) {
  if (!viewIds.includes(view)) view = 'terminal';
  currentView = view;
  viewIds.forEach((name) => {
    const section = document.getElementById(`${name}View`);
    if (section) section.classList.toggle('hidden', name !== view);
  });
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.nav === view));
  document.querySelectorAll('.mode-button').forEach((button) => button.classList.toggle('active', button.dataset.mode === (view === 'gui' ? 'gui' : 'terminal')));
  breadcrumbCurrent.textContent = viewLabels[view] || view;
  document.title = `${view === 'terminal' ? 'Terminal' : view === 'gui' ? 'GUI workspace' : view[0].toUpperCase() + view.slice(1)} — TermBox`;
  if (view === 'terminal') {
    setTimeout(() => {
      if (currentView !== 'terminal') return;
      terminalView?.fit();
      terminalView?.focus();
    }, 30);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message, iconName = 'check') {
  if (toastTimer) window.clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `${iconMarkup(iconName)}<span></span>`;
  toast.querySelector('span').textContent = message;
  toastRegion.innerHTML = '';
  toastRegion.appendChild(toast);
  toastTimer = window.setTimeout(() => {
    toast.classList.add('fade-out');
    window.setTimeout(() => toast.remove(), 200);
  }, 2800);
}

function openPalette() {
  paletteBackdrop.classList.remove('hidden');
  paletteInput.value = '';
  filterPalette('');
  requestAnimationFrame(() => paletteInput.focus());
}

function closePalette() {
  paletteBackdrop.classList.add('hidden');
  if (currentView === 'terminal') terminalView?.focus();
}

function filterPalette(query) {
  const normalized = query.trim().toLowerCase();
  const buttons = [...paletteResults.querySelectorAll('button')];
  buttons.forEach((button) => {
    button.classList.remove('selected');
    button.hidden = normalized && !button.textContent.toLowerCase().includes(normalized);
  });
  const firstVisible = buttons.find((button) => !button.hidden);
  if (firstVisible) firstVisible.classList.add('selected');
}

function paletteSelect(action) {
  if (action === 'clear') clearTerminal();
  else setView(action);
  closePalette();
}

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (paletteBackdrop.classList.contains('hidden')) openPalette();
    else closePalette();
  }
  if (event.key === 'Escape' && !paletteBackdrop.classList.contains('hidden')) closePalette();
  if (!event.metaKey && !event.ctrlKey && !event.altKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    if (event.key === '1') setView('terminal');
    if (event.key === '2') setView('gui');
    if (event.key.toLowerCase() === 'f') setView('files');
  }
});

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.mode));
});

document.querySelectorAll('[data-nav]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.nav));
});

document.querySelectorAll('[data-terminal-key]').forEach((button) => {
  button.addEventListener('click', () => terminalView?.handleVirtualKey(button.dataset.terminalKey));
});

document.querySelectorAll('[data-command]').forEach((button) => {
  button.addEventListener('click', () => {
    const command = button.dataset.command;
    setView('terminal');
    window.setTimeout(() => runCommand(command), 100);
  });
});

document.querySelectorAll('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    const tool = button.dataset.tool;
    if (tool === 'files') setView('files');
    else if (tool === 'packages') setView('packages');
    else if (tool === 'editor') showToast('Code Studio is ready to launch.', 'code');
    else showToast('System monitor preview uses sample metrics.', 'pulse');
  });
});

document.querySelectorAll('[data-file]').forEach((button) => {
  button.addEventListener('click', () => {
    const file = button.dataset.file;
    showToast(`Opening ${file} in Code Studio.`, 'code');
  });
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'palette') openPalette();
    else if (action === 'notify') showToast('You are all caught up.', 'bell');
    else if (action === 'split') showToast('Split terminals are not attached to this simulator.', 'split');
    else if (action === 'terminal-menu' || action === 'session-menu') showToast('Session options are a visual placeholder in this preview.', 'more');
    else if (action === 'customize') showToast('Launchpad customization is coming soon.', 'layout');
    else if (action === 'upgrade') showToast('Your free workspace is already active.', 'check');
    else if (action === 'upload') showToast('Import dialog is ready for a connected repo.', 'upload');
    else if (action === 'new-file') showToast('New file creation is ready in Code Studio.', 'plus');
    else if (action === 'connect') showToast('Connect a GitHub repository to sync this workspace.', 'git');
    else if (action === 'clear-activity') {
      document.querySelectorAll('.full-activity .timeline-item').forEach((item) => item.remove());
      showToast('Sample activity removed from this view.', 'trash');
    } else if (action === 'docs') showToast('Documentation will open in a new tab.', 'book');
    else if (action === 'feedback') showToast('Thanks — feedback channel is ready.', 'bell');
    else if (action === 'status') showToast('This preview has no live system status feed.', 'pulse');
  });
});

document.querySelectorAll('.terminal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.terminal-tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    showToast('These sample tabs share one local simulator session.', 'terminal');
  });
});

document.querySelector('.new-tab')?.addEventListener('click', () => showToast('Additional terminal sessions are not connected in this preview.', 'plus'));

document.querySelector('.workspace-picker')?.addEventListener('click', () => showToast('Workspace switcher is ready for more projects.', 'layout'));

paletteInput.addEventListener('input', () => filterPalette(paletteInput.value));
paletteInput.addEventListener('keydown', (event) => {
  const buttons = [...paletteResults.querySelectorAll('button:not([hidden])')];
  const selected = buttons.findIndex((button) => button.classList.contains('selected'));
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!buttons.length) return;
    const next = event.key === 'ArrowDown' ? (selected + 1) % buttons.length : (selected - 1 + buttons.length) % buttons.length;
    buttons.forEach((button) => button.classList.remove('selected'));
    buttons[next].classList.add('selected');
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (buttons[selected >= 0 ? selected : 0]) paletteSelect(buttons[selected >= 0 ? selected : 0].dataset.palette);
  }
});

paletteResults.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-palette]');
  if (button) paletteSelect(button.dataset.palette);
});
paletteBackdrop.addEventListener('click', (event) => {
  if (event.target === paletteBackdrop) closePalette();
});

document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  });
});

document.querySelector('.package-search input')?.addEventListener('input', (event) => {
  const query = event.target.value.toLowerCase().trim();
  document.querySelectorAll('.package-card').forEach((card) => {
    card.hidden = query && !card.textContent.toLowerCase().includes(query);
  });
});

terminalViewReady = import('./terminal-view.js')
  .then(({ TerminalView }) => {
    terminalView = new TerminalView(terminalOutput, {
      onCommand: handleTerminalCommand,
      getHistory: () => commandHistory,
      getPromptPath: () => sampleFilesystem.promptPath(),
      onEndOfInput: () => {
        appendLine('No shell process is attached to this simulator.', 'output', 'warn');
        appendSpacer();
      }
    });
    terminalView.mount();
    bootTerminal();
    if (currentView === 'terminal') terminalView.focus();
    return true;
  })
  .catch((error) => {
    console.error('TermBox could not initialize the xterm.js terminal.', error);
    terminalView = undefined;
    const terminalReady = document.querySelector('.terminal-ready');
    if (terminalReady) terminalReady.textContent = 'unavailable';
    showToast('The terminal display could not start. Refresh to retry.', 'terminal');
    return false;
  });
