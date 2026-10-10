import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleFileSystem } from '../simulator-filesystem.js';

test('sample filesystem starts in the demo project and renders a virtual home path', () => {
  const filesystem = new SampleFileSystem();

  assert.equal(filesystem.cwd, '/home/demo/projects/termbox');
  assert.equal(filesystem.promptPath(), '~/projects/termbox');
  assert.deepEqual(filesystem.list('.').entries, [
    { name: 'README.md', type: 'file' },
    { name: 'app.js', type: 'file' },
    { name: 'styles.css', type: 'file' },
    { name: 'src', type: 'directory' }
  ]);
});

test('directory changes support relative paths, parent traversal, absolute paths, and home', () => {
  const filesystem = new SampleFileSystem();

  assert.deepEqual(filesystem.changeDirectory('src'), {
    ok: true,
    path: '/home/demo/projects/termbox/src'
  });
  assert.equal(filesystem.promptPath(), '~/projects/termbox/src');
  assert.deepEqual(filesystem.changeDirectory('..'), {
    ok: true,
    path: '/home/demo/projects/termbox'
  });
  assert.equal(filesystem.changeDirectory('/home/demo').ok, true);
  assert.equal(filesystem.promptPath(), '~');
  assert.equal(filesystem.changeDirectory('~/projects').path, '/home/demo/projects');
  assert.equal(filesystem.changeDirectory('/').ok, true);
  assert.equal(filesystem.promptPath(), '/');
  assert.equal(filesystem.changeDirectory('~').path, '/home/demo');
});

test('unknown paths and files cannot become the working directory', () => {
  const filesystem = new SampleFileSystem();
  const originalPath = filesystem.cwd;

  assert.deepEqual(filesystem.changeDirectory('/etc'), { ok: false, path: '/etc' });
  assert.deepEqual(filesystem.changeDirectory('README.md'), {
    ok: false,
    path: '/home/demo/projects/termbox/README.md'
  });
  assert.deepEqual(filesystem.changeDirectory('~other'), { ok: false, path: null });
  assert.equal(filesystem.cwd, originalPath);
});

test('listing a sample file and directory is deterministic and does not read host files', () => {
  const filesystem = new SampleFileSystem();

  assert.deepEqual(filesystem.list('app.js'), {
    path: '/home/demo/projects/termbox/app.js',
    isDirectory: false,
    entries: [{ name: 'app.js', type: 'file' }]
  });
  assert.deepEqual(filesystem.list('src'), {
    path: '/home/demo/projects/termbox/src',
    isDirectory: true,
    entries: [{ name: 'index.js', type: 'file' }]
  });
  assert.equal(filesystem.list('/not-in-the-sample-tree'), null);
});
