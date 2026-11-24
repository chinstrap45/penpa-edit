// Every directory made here is removed when the test process exits.
import { execFileSync, spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENGINE = 'live/engine-replay-0.live.mjs'
export const UI = 'live/ui-replay-0.live.mjs'
export const PINS = 'live/pins.live.mjs'

// The environment for a child that runs `node --test`, without NODE_TEST_CONTEXT, which makes a child runner report to
// this one instead.
export const { NODE_TEST_CONTEXT, ...ENV } = process.env

// Runs `script --list ...args` in `dir`, the way both live runners take it, and returns what it printed one line each, with
// what it said on stderr.
export function listedBy (script, dir, ...args) {
  const out = spawnSync(process.execPath, [script, '--list', ...args], { cwd: dir, env: ENV, encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  return { lines: out.stdout.split('\n').filter(Boolean), said: out.stderr }
}

const made = []
process.on('exit', () => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

export function tree (files) {
  const dir = mkdtempSync(join(tmpdir(), 'live-scratch-'))
  made.push(dir)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  return dir
}

// A git repo in a scratch directory with `files` committed as `base`, and the git runner for it.
export function committedTree (files) {
  const dir = tree(files)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'master')
  git('config', 'user.name', 'test')
  git('config', 'user.email', 'test@example.com')
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  return { dir, git }
}

export function scratchRepo () {
  return committedTree({
    ...Object.fromEntries([ENGINE, UI, PINS, 'docs/ui/pins.js', 'docs/js/class_p.js', 'docs/js/engine_bridge.js']
      .map((file) => [file, '// one\n'])),
    'docs/index.html': '<script>load(["./js/class_p.js", "./js/new.js"])</script>\n',
    'package.json': readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
  })
}
