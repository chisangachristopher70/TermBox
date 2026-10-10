const HOME_DIRECTORY = '/home/demo';
const PROJECT_DIRECTORY = `${HOME_DIRECTORY}/projects/termbox`;

const SAMPLE_DIRECTORIES = new Map([
  ['/', Object.freeze([{ name: 'home', type: 'directory' }])],
  ['/home', Object.freeze([{ name: 'demo', type: 'directory' }])],
  [HOME_DIRECTORY, Object.freeze([
    { name: '.config', type: 'directory' },
    { name: 'projects', type: 'directory' }
  ])],
  [`${HOME_DIRECTORY}/.config`, Object.freeze([
    { name: 'termbox', type: 'directory' }
  ])],
  [`${HOME_DIRECTORY}/.config/termbox`, Object.freeze([
    { name: 'settings.json', type: 'file' }
  ])],
  [`${HOME_DIRECTORY}/projects`, Object.freeze([
    { name: 'termbox', type: 'directory' }
  ])],
  [PROJECT_DIRECTORY, Object.freeze([
    { name: 'README.md', type: 'file' },
    { name: 'app.js', type: 'file' },
    { name: 'styles.css', type: 'file' },
    { name: 'src', type: 'directory' }
  ])],
  [`${PROJECT_DIRECTORY}/src`, Object.freeze([
    { name: 'index.js', type: 'file' }
  ])]
]);

const SAMPLE_FILES = new Set([
  `${HOME_DIRECTORY}/.config/termbox/settings.json`,
  `${PROJECT_DIRECTORY}/README.md`,
  `${PROJECT_DIRECTORY}/app.js`,
  `${PROJECT_DIRECTORY}/styles.css`,
  `${PROJECT_DIRECTORY}/src/index.js`
]);

function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}` || '/';
}

export class SampleFileSystem {
  constructor() {
    this.currentPath = PROJECT_DIRECTORY;
  }

  get cwd() {
    return this.currentPath;
  }

  promptPath(path = this.currentPath) {
    if (path === HOME_DIRECTORY) return '~';
    if (path.startsWith(`${HOME_DIRECTORY}/`)) return `~${path.slice(HOME_DIRECTORY.length)}`;
    return path;
  }

  resolve(target = '.') {
    const requestedPath = String(target || '.').trim();
    let absolutePath;

    if (requestedPath === '~') {
      absolutePath = HOME_DIRECTORY;
    } else if (requestedPath.startsWith('~/')) {
      absolutePath = `${HOME_DIRECTORY}/${requestedPath.slice(2)}`;
    } else if (requestedPath.startsWith('~')) {
      return null;
    } else if (requestedPath.startsWith('/')) {
      absolutePath = requestedPath;
    } else {
      absolutePath = `${this.currentPath}/${requestedPath}`;
    }

    return normalizePath(absolutePath);
  }

  changeDirectory(target = '~') {
    const path = this.resolve(target);
    if (!path || !SAMPLE_DIRECTORIES.has(path)) return { ok: false, path };
    this.currentPath = path;
    return { ok: true, path };
  }

  list(target = '.') {
    const path = this.resolve(target);
    if (!path) return null;

    const entries = SAMPLE_DIRECTORIES.get(path);
    if (entries) {
      return {
        path,
        isDirectory: true,
        entries: entries.map((entry) => ({ ...entry }))
      };
    }

    if (SAMPLE_FILES.has(path)) {
      return {
        path,
        isDirectory: false,
        entries: [{ name: path.slice(path.lastIndexOf('/') + 1), type: 'file' }]
      };
    }

    return null;
  }
}
