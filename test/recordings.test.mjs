// `live/recordings.mjs`: reading and writing recordings with no browser library, and the helpers the replay, the
// fuzz and the expected-file gate share. The gate's own import chain is walked for Playwright.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  diffLine, entries, expectedFile, readExpected, recordingText, withoutDuplicateDrops, writeExpected, writeRecording
} from '../live/recordings.mjs'

// What `source` imports or re-exports, statically or not: an `import`/`export ... from` over any number of lines, a bare
// `import '...'` and an `import('...')`.
const importsOf = (source) => [...source.matchAll(
  /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm
)].map((m) => m[1] ?? m[2] ?? m[3])

// Every module and package `file` imports, followed through the relative imports.
function importChain (file, seen = new Set()) {
  if (seen.has(file)) return seen
  seen.add(file)
  for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
    if (specifier.startsWith('.')) importChain(resolve(dirname(file), specifier), seen)
    else seen.add(specifier)
  }
  return seen
}

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

describe('the expected-file gate', () => {
  it('imports no Playwright, nor any module that does', () => {
    const chain = [...importChain(here('../.github/scripts/expected-gate.mjs'))]
    assert.ok(chain.includes(here('../live/expected-diff.mjs')) && chain.includes(here('../live/recordings.mjs')), 'the walk reaches the gate\'s own modules')
    assert.deepEqual(chain.filter((m) => /playwright/.test(m) || /\/(replay|page)\.mjs$/.test(m)), [])
  })

  it('is walked through every form of import', () => {
    const source = [
      "import { a } from './one.mjs'",
      'import {\n  b,\n  c\n} from "./two.mjs"',
      "export { d } from './three.mjs'",
      "export * from './four.mjs'",
      "import './five.mjs'",
      "const six = await import('./six.mjs')",
      "import { chromium } from 'playwright'",
      "// a line that says it comes from 'nowhere.mjs'",
      "const seven = 'from'"
    ].join('\n')
    assert.deepEqual(importsOf(source), ['./one.mjs', './two.mjs', './three.mjs', './four.mjs', './five.mjs', './six.mjs', 'playwright'])
  })
})

describe('withoutDuplicateDrops', () => {
  it('leaves out the selection and the redo stacks\' lengths, as a duplicate link drops them', () => {
    const state = 'pu_a.command_redo.length = 3\npu_a_col.command_redo.length = 1\nselection = [1,2]\nsurface.4 = 1\n'
    assert.equal(withoutDuplicateDrops(state), 'surface.4 = 1\n')
  })
})

describe('diffLine', () => {
  it('reads `key: want → got`, a missing side as absent', () => {
    assert.equal(diffLine('a', entries('a = 1\n'), entries('a = 2\n')), 'a: 1 → 2')
    assert.equal(diffLine('b', entries('a = 1\n'), entries('b = 2\n')), 'b: absent → 2')
  })
})

describe('writing recordings', () => {
  it('writeRecording and writeExpected put a recording and its expected file where readExpected reads them', async () => {
    const dir = pathToFileURL(mkdtempSync(resolve(tmpdir(), 'rec-')) + '/')
    try {
      const recording = { header: { source: '?a' }, final: { x: 1 }, steps: [{ kind: 'undo' }] }
      await writeRecording('fam/name', recording, dir)
      assert.equal(readFileSync(new URL('fam/name.steps.json', dir), 'utf8'), recordingText(recording))
      await writeExpected('fam/name', [{ step: 0, state: 'a = 1\n' }], dir)
      assert.deepEqual(await readExpected('fam/name', dir), [{ step: 0, state: 'a = 1\n' }])
      assert.deepEqual(expectedFile([{ step: 0, state: 'a = 1\n' }]), { checkpoints: [{ step: 0, state: ['a = 1'] }] })
    } finally { rmSync(dir, { recursive: true }) }
  })
})
