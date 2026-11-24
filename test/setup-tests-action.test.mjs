// The shared setup action caches Playwright's Chromium (#417): a run restores it, and downloads only on a cache miss.
// GitHub's cache itself is proven only by two real runs (the ticket's criteria); this reads the action's own steps,
// since no YAML parser is a dependency.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const ACTION = readFileSync(new URL('../.github/actions/setup-tests/action.yml', import.meta.url), 'utf8')
const steps = ACTION.split(/^ {4}- /m).slice(1)
const stepRunning = (command) => steps.find((step) => step.split('\n').includes(`      run: ${command}`))

const stepId = (step) => step?.match(/^ *(?:- )?id: (\S+)/m)?.[1]
const cacheStep = steps.find((step) => /uses: actions\/cache@/.test(step))
const versionStep = steps.find((step) => step.includes("packages['node_modules/playwright'].version"))

describe('setup-tests action: Playwright browser cache', () => {
  it('caches ~/.cache/ms-playwright with actions/cache', () => {
    assert.match(cacheStep ?? '', /path: ~\/\.cache\/ms-playwright$/m)
  })
  it('keys the cache on the Playwright version read from the lockfile', () => {
    assert.match(versionStep ?? '', /package-lock\.json/)
    const id = stepId(versionStep)
    assert.ok(id, 'the version step has an id')
    assert.match(versionStep, /echo "version=\$version" >> "\$GITHUB_OUTPUT"/)
    assert.match(cacheStep ?? '', new RegExp(`key: .*\\$\\{\\{ steps\\.${id}\\.outputs\\.version \\}\\}`))
  })
  it('fails the step when the lockfile has no version, rather than writing an empty one', () => {
    assert.match(versionStep ?? '', /^ *version=\$\(node -p /m)
  })
  it('downloads Chromium only when the cache step reports no hit, without the apt packages', () => {
    const cacheId = stepId(cacheStep)
    assert.ok(cacheId, 'the cache step has an id')
    assert.match(stepRunning('npx playwright install chromium') ?? '', new RegExp(`^ *(?:- )?if: steps\\.${cacheId}\\.outputs\\.cache-hit != 'true'$`, 'm'))
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
