/* TermBox is intentionally dependency-free so the same build can be deployed to Vercel,
   GitHub Pages, or shared as a static folder. The shell below is a browser-safe simulator,
   not a remote command runner. */

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
let historyIndex = 0;
let toastTimer;

const terminalOutput = document.getElementById('terminalOutput');
const commandInput = document.getElementById('commandInput');
const commandForm = document.getElementById('commandForm');
const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');
const toastRegion = document.querySelector('.toast-region');
const paletteBackdrop = document.getElementById('paletteBackdrop');
const paletteInput = document.getElementById('paletteInput');
const paletteResults = document.getElementById('paletteResults');

function appendLine(text = '', type = 'output', className = '') {
  const line = document.createElement('div');
  line.className = `terminal-line ${type} ${className}`.trim();
  line.textContent = text;
  terminalOutput.appendChild(line);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
  return line;
}

function appendCommand(command) {
  const line = document.createElement('div');
  line.className = 'terminal-line command';
  const prompt = document.createElement('span');
  prompt.className = 'prompt-symbol';
  prompt.textContent = '›';
  const path = document.createElement('span');
  path.className = 'prompt-path';
  path.textContent = '~/projects/termbox';
  const text = document.createElement('span');
  text.className = 'command-text';
  text.textContent = `$ ${command}`;
  line.append(prompt, path, text);
  terminalOutput.appendChild(line);
  return line;
}

function appendSpacer() {
  const line = document.createElement('div');
  line.className = 'terminal-line spacer';
  terminalOutput.appendChild(line);
}

function bootTerminal() {
  terminalOutput.innerHTML = '';
  appendLine('Welcome to TermBox, Jordan.', 'output', 'highlight');
  appendLine('A browser-native Linux workspace for curious people.', 'output');
  appendSpacer();
  appendCommand('neofetch');
  const fetchLine = document.createElement('div');
  fetchLine.className = 'terminal-line output';
  fetchLine.innerHTML = '<span class="term-ascii">        ████████╗██████╗<br>        ╚══██╔══╝██╔══██╗<br>           ██║   ██████╔╝<br>           ██║   ██╔══██╗<br>           ██║   ██████╔╝<br>           ╚═╝   ╚═════╝</span>';
  terminalOutput.appendChild(fetchLine);
  appendLine('  termbox@web  •  browser sandbox  •  session online', 'output', 'highlight');
  appendLine('  shell: bash 5.2  •  node: v20.11.1  •  cwd: ~/projects/termbox', 'output');
  appendSpacer();
  appendLine("Type 'help' to see what you can run.", 'output', 'success');
  terminalOutput.scrollTop = 0;
}

function clearTerminal() {
  terminalOutput.innerHTML = '';
  appendLine('Terminal cleared.', 'output', 'success');
  appendSpacer();
  commandInput.focus();
}

function printLines(lines, type = 'output') {
  lines.forEach((line) => appendLine(line.text || line, line.type || type, line.className || ''));
}

function commandResponse(rawCommand) {
  const command = rawCommand.trim();
  const lower = command.toLowerCase();
  if (!command) return;

  if (lower === 'clear' || lower === 'cls') {
    clearTerminal();
    return;
  }

  appendCommand(command);
  appendSpacer();

  if (lower === 'help' || lower === 'termbox --help') {
    printLines([
      { text: 'TermBox commands', className: 'highlight' },
      '  help                 show this list',
      '  ls [-la]             list workspace files',
      '  pwd                  print current directory',
      '  neofetch             show workspace information',
      '  gui                  switch to GUI mode',
      '  clear                clear the terminal',
      '  pkg <command>        manage sandbox packages',
      '  npm run <script>     run a project script',
      '  echo <text>          print a message',
      '  date                 print the current date'
    ]);
  } else if (lower === 'pwd') {
    appendLine('/home/termbox/projects/termbox', 'output', 'highlight');
  } else if (lower === 'whoami') {
    appendLine('jordan', 'output', 'highlight');
  } else if (lower === 'ls' || lower === 'ls -la' || lower === 'ls -al') {
    printLines([
      { text: 'total 32', className: 'highlight' },
      'drwxr-xr-x  5 jordan  staff  160  Oct 08 15:56  .',
      'drwxr-xr-x  4 jordan  staff  128  Oct 08 15:40  ..',
      'drwxr-xr-x  8 jordan  staff  256  Oct 08 15:56  .git',
      '-rw-r--r--  1 jordan  staff  8.4K Oct 08 15:55  app.js',
      '-rw-r--r--  1 jordan  staff 14.2K Oct 08 15:50  styles.css',
      '-rw-r--r--  1 jordan  staff  3.1K Oct 08 15:41  README.md'
    ]);
  } else if (lower === 'neofetch') {
    printLines([
      { text: '  TermBox web workspace', className: 'highlight' },
      '  ─────────────────────',
      '  OS       TermBox Sandbox (browser)',
      '  Host     vercel-edge / local session',
      '  Kernel   web-runtime 1.0',
      '  Shell    bash 5.2',
      '  Memory   384 MB / 1 GB'
    ]);
  } else if (lower === 'date') {
    appendLine(new Date().toString(), 'output', 'highlight');
  } else if (lower === 'npm -v' || lower === 'npm --version') {
    appendLine('10.2.4', 'output', 'highlight');
  } else if (lower === 'node -v' || lower === 'node --version') {
    appendLine('v20.11.1', 'output', 'highlight');
  } else if (lower === 'python --version' || lower === 'python3 --version') {
    appendLine('Python 3.12.2', 'output', 'highlight');
  } else if (lower === 'git status') {
    printLines([
      { text: 'On branch main', className: 'highlight' },
      'Your branch is up to date with origin/main.',
      '',
      'Changes not staged for commit:',
      '  modified:   app.js',
      '  modified:   styles.css',
      '',
      { text: 'nothing added to commit yet', className: 'success' }
    ]);
  } else if (lower === 'git log' || lower === 'git log --oneline') {
    printLines([
      'a4f18d2  Refine terminal command palette',
      'c91b62a  Add GUI workspace launchpad',
      '9e5407d  Create TermBox shell'
    ]);
  } else if (lower === 'npm run dev') {
    printLines([
      { text: '> termbox@0.1.0 dev', className: 'highlight' },
      '> vite --host 0.0.0.0',
      '',
      { text: '  VITE v5.4.10  ready in 412 ms', className: 'success' },
      '  ➜  Local:   http://localhost:5173/',
      { text: '  ➜  press h + enter to show help', className: 'highlight' }
    ]);
  } else if (lower === 'npm run build') {
    printLines([
      { text: '> termbox@0.1.0 build', className: 'highlight' },
      '> vite build',
      'transforming modules...',
      '✓ 14 modules transformed.',
      { text: '✓ built in 4.2s', className: 'success' }
    ]);
  } else if (lower === 'pkg update' || lower === 'apt update') {
    printLines([
      'Get:1 https://packages.termbox.dev stable InRelease',
      'Reading package lists... Done',
      { text: 'All packages are up to date.', className: 'success' }
    ]);
  } else if (lower.startsWith('pkg install ') || lower.startsWith('apt install ')) {
    const packageName = command.split(/\s+/).slice(2).join(' ') || 'package';
    printLines([
      `Reading package lists... Done`,
      `Building dependency tree... Done`,
      `Selecting previously unselected package ${packageName}.`,
      { text: `Setting up ${packageName}...`, className: 'highlight' },
      { text: `✓ ${packageName} is ready in your workspace.`, className: 'success' }
    ]);
  } else if (lower === 'exit') {
    appendLine('This browser sandbox stays open so you can keep building.', 'output', 'warn');
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
    appendLine(`bash: ${command.split(/\s+/)[0]}: command not found`, 'output', 'warn');
    appendLine("Type 'help' for available TermBox commands.", 'output');
  }

  appendSpacer();
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function runCommand(rawCommand) {
  const command = rawCommand.trim();
  if (!command) {
    commandInput.focus();
    return;
  }
  commandHistory = commandHistory.filter((item) => item !== command);
  commandHistory.push(command);
  historyIndex = commandHistory.length;
  commandResponse(command);
  commandInput.value = '';
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
  if (view === 'terminal') setTimeout(() => commandInput.focus(), 30);
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
  if (currentView === 'terminal') commandInput.focus();
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

commandForm.addEventListener('submit', (event) => {
  event.preventDefault();
  runCommand(commandInput.value);
});

commandInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!commandHistory.length) return;
    historyIndex = Math.max(0, historyIndex - 1);
    commandInput.value = commandHistory[historyIndex] || '';
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    historyIndex = Math.min(commandHistory.length, historyIndex + 1);
    commandInput.value = commandHistory[historyIndex] || '';
  } else if (event.key === 'Tab') {
    event.preventDefault();
    const suggestions = ['help', 'ls -la', 'neofetch', 'gui', 'npm run dev', 'npm run build', 'pkg update'];
    const match = suggestions.find((suggestion) => suggestion.startsWith(commandInput.value.toLowerCase()));
    if (match) commandInput.value = match;
  } else if (event.key.toLowerCase() === 'l' && event.ctrlKey) {
    event.preventDefault();
    clearTerminal();
  }
});

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
    else showToast('System monitor is watching your sandbox.', 'pulse');
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
    else if (action === 'split') showToast('Split terminal is available in the next session.', 'split');
    else if (action === 'terminal-menu' || action === 'session-menu') showToast('Session options saved for later.', 'more');
    else if (action === 'customize') showToast('Launchpad customization is coming soon.', 'layout');
    else if (action === 'upgrade') showToast('Your free workspace is already active.', 'check');
    else if (action === 'upload') showToast('Import dialog is ready for a connected repo.', 'upload');
    else if (action === 'new-file') showToast('New file creation is ready in Code Studio.', 'plus');
    else if (action === 'connect') showToast('Connect a GitHub repository to sync this workspace.', 'git');
    else if (action === 'clear-activity') showToast('Activity log cleared for this session.', 'trash');
    else if (action === 'docs') showToast('Documentation will open in a new tab.', 'book');
    else if (action === 'feedback') showToast('Thanks — feedback channel is ready.', 'bell');
    else if (action === 'status') showToast('All TermBox systems are operational.', 'pulse');
  });
});

document.querySelectorAll('.terminal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.terminal-tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    showToast(`${tab.textContent.replace('×', '').trim()} session selected.`, 'terminal');
  });
});

document.querySelector('.new-tab')?.addEventListener('click', () => showToast('New session created in the next workspace.', 'plus'));

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

bootTerminal();
