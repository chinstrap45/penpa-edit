// `unpackUpstreamDocs` (live/upstream-docs.mjs) names a missing `upstream/master` ref as that, and lets any other git failure
// through as itself, so a directory that is no repository is never told to run `git fetch upstream master`. Run in a child, since it reads the cwd.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(new URL('../live/upstream-docs.mjs', import.meta.url))
const ROOT = mkdtempSync(join(tmpdir(), 'upstream-docs-'))
after(() => rmSync(ROOT, { recursive: true, force: true }))

// The message `unpackUpstreamDocs` throws when run in `cwd`.
function failureIn (cwd) {
  const script = `import(${JSON.stringify(MODULE)}).then((m) => { try { m.unpackUpstreamDocs() } catch (e) { console.log(e.message); return }; console.log('no throw') })`
  const { stdout, status } = spawnSync(process.execPath, ['-e', script], {
    cwd, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: ROOT }
  })
  assert.equal(status, 0)
  return stdout.trim()
}

describe('unpackUpstreamDocs', () => {
  it('says the ref is missing in a repository without it', () => {
    const repo = join(ROOT, 'repo')
    execFileSync('git', ['init', '-q', repo])
    assert.match(failureIn(repo), /upstream\/master is missing: run `git fetch upstream master`/)
  })

  it('does not call a directory that is no repository a missing ref', () => {
    const message = failureIn(ROOT)
    assert.doesNotMatch(message, /is missing: run/)
    assert.match(message, /not a git repository/)
  })
})
