import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'
import { FORK_URL as FORK, RAW_SCRIPT_URL, REDIRECT_SCRIPT, UPSTREAM_URL as UPSTREAM } from './redirect-urls.mjs'

function redirectOf (href) {
  let target = null
  vm.runInNewContext(readFileSync(REDIRECT_SCRIPT, 'utf8'), { location: { href, replace: (url) => { target = url } } })
  return target
}

function headerOf () {
  const header = readFileSync(REDIRECT_SCRIPT, 'utf8').match(/\/\/ ==UserScript==\n([\s\S]*?)\/\/ ==\/UserScript==/)[1]
  return Object.fromEntries([...header.matchAll(/^\/\/ @(\S+)\s+(.*)$/gm)].map(([, key, value]) => [key, value.trim()]))
}

const VERSION_LINE = /^\/\/ @version\s+(\S+)$/m
const versionOf = (text) => text.match(VERSION_LINE)[1]
// Tampermonkey updates an installed copy only on a version rise, so a header change (a new @match) needs one as much as the code.
const withoutVersion = (text) => text.replace(VERSION_LINE, '')

// True when dotted version `a` is greater than `b`, compared number by number.
function isGreater (a, b) {
  const [left, right] = [a, b].map((version) => version.split('.').map(Number))
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const [x, y] = [left[i] ?? 0, right[i] ?? 0]
    if (x !== y) return x > y
  }
  return false
}

// Throws when `head` differs from `base` other than in its @version line, and its @version is not above `base`'s.
function assertVersionBumped (base, head) {
  if (withoutVersion(base) === withoutVersion(head)) return
  assert.ok(isGreater(versionOf(head), versionOf(base)), `the script changed but @version stays ${versionOf(head)} (master: ${versionOf(base)})`)
}

describe('the Redirect script', () => {
  const script = (version, body, match = 'https://a.test/*') =>
    `// ==UserScript==\n// @version ${version}\n// @match ${match}\n// ==/UserScript==\n${body}\n`

  it('fails a body or header change that keeps the version, or lowers it', () => {
    assert.throws(() => assertVersionBumped(script('1.2.0', 'a()'), script('1.2.0', 'b()')), /@version stays 1\.2\.0/)
    assert.throws(() => assertVersionBumped(script('1.2.0', 'a()'), script('1.2.0', 'a()', 'https://b.test/*')), /@version stays 1\.2\.0/)
    assert.throws(() => assertVersionBumped(script('1.10.0', 'a()'), script('1.9.0', 'b()')), /@version stays/)
  })

  it('passes a change with a higher version, compared number by number, and an unchanged script', () => {
    assertVersionBumped(script('1.9.0', 'a()'), script('1.10.0', 'b()'))
    assertVersionBumped(script('1.2.0', 'a()'), script('1.2.0', 'a()'))
  })

  it('has a version above the one on origin/master when it differs from master\'s', () => {
    const onMaster = execFileSync('git', ['show', 'origin/master:userscript/penpa-redirect.user.js'], { encoding: 'utf8' })
    assertVersionBumped(onMaster, readFileSync(REDIRECT_SCRIPT, 'utf8'))
  })

  it('names ChinStrap, the name the pages speak in, and not caneff, in what Tampermonkey shows', () => {
    const { name, description } = headerOf()
    for (const shown of [name, description]) {
      assert.match(shown, /ChinStrap/)
      assert.doesNotMatch(shown, /caneff/i)
    }
  })

  it('matches upstream\'s pages, runs at document start and updates from the raw file on master', () => {
    const header = headerOf()
    assert.equal(header.match, UPSTREAM + '*')
    assert.equal(header['run-at'], 'document-start')
    assert.equal(header.updateURL, RAW_SCRIPT_URL)
    assert.equal(header.downloadURL, RAW_SCRIPT_URL)
  })

  it('sends a solve link to solve.html, keeping its # data byte for byte', () => {
    assert.equal(redirectOf(UPSTREAM + 'index.html#m=solve&p=abc%2Fdef'), FORK + 'solve.html#m=solve&p=abc%2Fdef')
  })

  it('sends a solve link on the bare page to solve.html', () => {
    assert.equal(redirectOf(UPSTREAM + '#m=solve&p=abc%2Fdef'), FORK + 'solve.html#m=solve&p=abc%2Fdef')
  })

  it('sends a ?-style solve link to solve.html, keeping its query', () => {
    assert.equal(redirectOf(UPSTREAM + '?m=solve&p=abc'), FORK + 'solve.html?m=solve&p=abc')
  })

  it('keeps an edit link on the fork\'s same path', () => {
    assert.equal(redirectOf(UPSTREAM + '#m=edit&p=abc'), FORK + '#m=edit&p=abc')
    assert.equal(redirectOf(UPSTREAM + 'index.html#m=edit&p=abc'), FORK + 'index.html#m=edit&p=abc')
  })

  it('keeps a link with no m= on the fork\'s same path, query and # data kept', () => {
    assert.equal(redirectOf(UPSTREAM + 'index.html?x=1#p=abc'), FORK + 'index.html?x=1#p=abc')
  })

  it('sends the bare page to the bare fork page', () => {
    assert.equal(redirectOf(UPSTREAM), FORK)
  })

  it('does not take m=solvex or a p= value containing m=solve for a solve link', () => {
    assert.equal(redirectOf(UPSTREAM + '#m=solvex&p=abc'), FORK + '#m=solvex&p=abc')
    assert.equal(redirectOf(UPSTREAM + '#m=edit&p=xm=solve'), FORK + '#m=edit&p=xm=solve')
  })

  it('leaves the fork alone, solve.html and index.html both', () => {
    assert.equal(redirectOf(FORK + 'solve.html#m=solve&p=abc'), null)
    assert.equal(redirectOf(FORK + 'index.html#m=solve&p=abc'), null)
  })
})
