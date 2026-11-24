// `live/build-solve.mjs` (#431): `docs/solve.html` is built from `docs/index.html`, never edited by hand.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { EDITS, buildSolve } from '../live/build-solve.mjs'

const read = (name) => readFileSync(new URL(`../docs/${name}`, import.meta.url), 'utf8')

describe('the solve page build', () => {
  it('reproduces the committed solve.html byte for byte (run node live/build-solve.mjs after an edit)', () => {
    assert.equal(buildSolve(read('index.html')), read('solve.html'))
  })

  it('reaches solve.html with a change made to index.html', () => {
    const changed = read('index.html').replace('<title>', '<title>upstream change ')
    assert.match(buildSolve(changed), /<title>upstream change /)
  })

  it('fails naming the edit when upstream moved its text, or when it occurs twice', () => {
    const { name, find } = EDITS[0]
    const eol = read('index.html').includes('\r\n') ? '\r\n' : '\n'
    const text = find.replaceAll('\n', eol)
    assert.throws(() => buildSolve(read('index.html').replace(text, '')), new RegExp(`"${name}" occurs 0 times`))
    assert.throws(() => buildSolve(read('index.html') + text), new RegExp(`"${name}" occurs 2 times`))
  })

  it('keeps the line ending of index.html in what it adds', () => {
    const lf = buildSolve(read('index.html').replaceAll('\r\n', '\n'))
    assert.doesNotMatch(lf, /\r/)
    assert.equal(lf.replaceAll('\n', '\r\n'), read('solve.html'))
  })
})
