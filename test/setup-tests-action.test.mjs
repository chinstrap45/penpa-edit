// The shared setup action caches Playwright's Chromium (#417): a run restores it, and downloads only on a cache miss.
// GitHub's cache itself is proven only by two real runs (the ticket's criteria); this reads the action's own steps,
// since no YAML parser is a dependency.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const ACTION = readFileSync(new URL('../.github/actions/setup-tests/action.yml', import.meta.url), 'utf8')
const steps = ACTION.split(/^ {4}- /m).slice(1)
const stepRunning = (command) => steps.find((step) => step.split('\n').includes(`      run: ${command}`))

describe('setup-tests action: Playwright browser cache', () => {
  it('caches ~/.cache/ms-playwright with actions/cache', () => {
    const cache = steps.find((step) => /uses: actions\/cache@/.test(step))
    assert.match(cache ?? '', /path: ~\/\.cache\/ms-playwright$/m)
  })
  it('keys the cache on the Playwright version read from the lockfile', () => {
    const reader = steps.find((step) => step.includes("packages['node_modules/playwright'].version"))
    assert.match(reader ?? '', /package-lock\.json/)
    const id = reader?.match(/id: (\S+)/)?.[1]
    assert.ok(id, 'the version step has an id')
    assert.match(steps.find((step) => /actions\/cache@/.test(step)) ?? '', new RegExp(`key: .*\\$\\{\\{ steps\\.${id}\\.outputs\\.\\S+ \\}\\}`))
  })
  it('downloads Chromium only on a cache miss, without the apt packages', () => {
    const download = stepRunning('npx playwright install chromium')
    assert.match(download ?? '', /if: steps\.\S+\.outputs\.cache-hit != 'true'/)
  })
  it('installs the apt packages on every run', () => {
    const deps = stepRunning('npx playwright install-deps chromium')
    assert.ok(deps, 'install-deps step exists')
    assert.doesNotMatch(deps, /^ *if:/m)
  })
  it('has no combined install --with-deps, which downloads every run', () => {
    assert.doesNotMatch(ACTION, /install --with-deps/)
  })
})
