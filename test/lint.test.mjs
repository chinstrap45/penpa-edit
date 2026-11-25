// The lint (`live/lint.mjs`, #396): its scope is read from `.gitattributes`, never from a second list, and a missing
// tool fails it.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NOT_LINTED, isNotLinted, lintScope, ownedFiles, runLint } from '../live/lint.mjs'
import { committedTree } from './live-scratch.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function scratch (files, owned) {
  return committedTree({ ...files, '.gitattributes': owned.map((pattern) => `${pattern} merge=ours\n`).join('') }).dir
}

// Links the repo's installed StandardJS in; shellcheck is the system's, found on PATH.
function withTools (dir) {
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  symlinkSync(join(ROOT, 'node_modules/standard'), join(dir, 'node_modules/standard'))
  symlinkSync(join(ROOT, 'node_modules/.bin/standard'), join(dir, 'node_modules/.bin/standard'))
  return dir
}

const CLEAN_JS = 'export const one = 1\n'
const BAD_JS = 'var x = 1;\n'
const CLEAN_SH = '#!/bin/sh\necho ok\n'
const BAD_SH = '#!/bin/sh\nif [ then\n'

describe('lintScope', () => {
  it('holds exactly the JavaScript and shell files .gitattributes gives merge=ours', () => {
    const dir = scratch({
      'live/a.mjs': CLEAN_JS,
      'docs/ui/b.js': CLEAN_JS,
      'docs/js/upstream.js': CLEAN_JS,
      '.github/scripts/c.sh': CLEAN_SH,
      'scripts/other.sh': CLEAN_SH,
      'live/notes.md': '# x\n'
    }, ['live/**', 'docs/ui/**', '/.github/scripts/**'])
    const scope = lintScope(dir)
    assert.deepEqual(scope.js.sort(), ['docs/ui/b.js', 'live/a.mjs'])
    assert.deepEqual(scope.shell, ['.github/scripts/c.sh'])
  })

  it('leaves out the vendored bundle and the generated gallery list', () => {
    const dir = scratch({ 'docs/ui/vendor/w.js': CLEAN_JS, 'docs/gallery-puzzles.js': CLEAN_JS, 'docs/ui/b.js': CLEAN_JS }, ['docs/ui/**', 'docs/gallery-puzzles.js'])
    assert.deepEqual(lintScope(dir).js, ['docs/ui/b.js'])
  })
})

describe('the repo', () => {
  const owned = ownedFiles(ROOT)

  it('names only exceptions that exist', () => {
    for (const path of NOT_LINTED) assert.ok(owned.filter(isNotLinted).some((file) => file.startsWith(path)), `${path} is not an owned file`)
  })

  it('leaves out upstream files', () => {
    const scope = lintScope(ROOT)
    assert.ok(scope.js.includes('docs/ui/desk.js'))
    assert.ok(scope.shell.includes('.github/scripts/upstream-merge.sh'))
    assert.ok(![...scope.js, ...scope.shell].some((file) => /^docs\/js\/class_|^docs\/js\/main\.js$/.test(file)), 'an upstream file is linted')
  })

  it('reads the hooks and the gate tests', () => {
    const { js } = lintScope(ROOT)
    for (const file of ['.claude/hooks/deny-npm-ci-symlink.mjs', '.claude/hooks/deny-recording-writes.mjs', 'test/recordings-approve.test.mjs', 'test/recordings-hook.test.mjs', 'test/expected-gate.test.mjs', 'test/required-checks.test.mjs', 'test/npm-ci-hook.test.mjs']) {
      assert.ok(js.includes(file), `${file} is not linted`)
    }
  })

  // A new owned file of a kind neither tool reads stays unlinted unless someone adds it here on purpose.
  it('leaves unlinted only owned files of the kinds no tool here reads', () => {
    const scope = lintScope(ROOT)
    const linted = new Set([...scope.js, ...scope.shell])
    const kinds = new Set(owned.filter((file) => !linted.has(file) && !isNotLinted(file)).map((file) => extname(file)))
    assert.deepEqual([...kinds].sort(), ['', '.css', '.html', '.json', '.md', '.yml'].filter((kind) => kinds.has(kind)))
  })
})

describe('the entry points', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8')

  it('runs the lint script from live/lint.mjs', () => {
    assert.equal(JSON.parse(read('package.json')).scripts.lint, 'node live/lint.mjs')
  })

  it('runs the lint in CI and in the Seam', () => {
    assert.match(read('.github/workflows/ci.yml'), /^ +- run: npm run lint$/m)
    assert.match(read('AGENTS.md'), /^- \*\*Seam\*\*: `npm run lint && npm test && /m)
  })
})

describe('runLint', () => {
  it('reports a StandardJS finding in an owned file', () => {
    const dir = withTools(scratch({ 'live/a.mjs': BAD_JS, 'live/ok.sh': CLEAN_SH }, ['live/**']))
    const out = runLint(dir).join('\n')
    assert.match(out, /a\.mjs:1:\d+: Extra semicolon/)
  })

  it('reports a shellcheck error in an owned script', () => {
    const dir = withTools(scratch({ 'live/a.mjs': CLEAN_JS, 'live/bad.sh': BAD_SH }, ['live/**']))
    assert.match(runLint(dir).join('\n'), /bad\.sh/)
  })

  it('does not report a finding in a file it does not own', () => {
    const dir = withTools(scratch({ 'live/a.mjs': CLEAN_JS, 'live/ok.sh': CLEAN_SH, 'docs/js/class_p.js': BAD_JS, 'docs/js/bad.sh': BAD_SH }, ['live/**']))
    assert.deepEqual(runLint(dir), [])
  })

  it('checks an owned file under a dot-directory, which StandardJS skips by itself', () => {
    const dir = withTools(scratch({ '.github/scripts/g.mjs': BAD_JS, 'live/a.mjs': CLEAN_JS, 'live/ok.sh': CLEAN_SH }, ['.github/scripts/**', 'live/**']))
    assert.match(runLint(dir).join('\n'), /\.github\/scripts\/g\.mjs:1:\d+: Extra semicolon/)
  })

  it('fails when a tool is not installed', () => {
    const dir = scratch({ 'live/a.mjs': CLEAN_JS, 'live/ok.sh': CLEAN_SH }, ['live/**'])
    assert.ok(!existsSync(join(dir, 'node_modules')))
    assert.match(runLint(dir).join('\n'), /standard is not installed/)
  })

  it('fails when shellcheck is not on PATH, names the install command, and still reports StandardJS findings', () => {
    const dir = withTools(scratch({ 'live/a.mjs': BAD_JS, 'live/ok.sh': CLEAN_SH }, ['live/**']))
    const out = runLint(dir, { ...process.env, PATH: join(dir, 'no-such-dir') }).join('\n')
    assert.match(out, /shellcheck is not installed on PATH: run sudo apt-get install shellcheck/)
    assert.match(out, /Extra semicolon/)
  })

  it('fails when .gitattributes owns no shell script, or no JavaScript file', () => {
    assert.match(runLint(withTools(scratch({ 'live/a.mjs': CLEAN_JS }, ['live/**']))).join('\n'), /scope is empty/)
    assert.match(runLint(withTools(scratch({ 'live/ok.sh': CLEAN_SH }, ['live/**']))).join('\n'), /scope is empty/)
  })

  it('checks an owned file that is not yet added to git', () => {
    const dir = withTools(scratch({ 'live/a.mjs': CLEAN_JS, 'live/ok.sh': CLEAN_SH }, ['live/**']))
    writeFileSync(join(dir, 'live/new.mjs'), BAD_JS)
    assert.match(runLint(dir).join('\n'), /new\.mjs:1:\d+: Extra semicolon/)
  })
})
