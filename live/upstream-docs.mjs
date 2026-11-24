import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const UPSTREAM_REF = 'upstream/master'
// A tar of `docs/` is tens of megabytes (fonts, images).
const ARCHIVE_MAX_BYTES = 1 << 29

export function unpackUpstreamDocs () {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${UPSTREAM_REF}^{commit}`])
  } catch {
    throw new Error(`${UPSTREAM_REF} is missing: run \`git fetch upstream master\``)
  }
  const archive = execFileSync('git', ['archive', '--format=tar', UPSTREAM_REF, 'docs'], { maxBuffer: ARCHIVE_MAX_BYTES })
  const dir = mkdtempSync(join(tmpdir(), 'upstream-docs-'))
  try {
    execFileSync('tar', ['-x', '-C', dir], { input: archive })
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  }
  return {
    pageUrl: pathToFileURL(join(dir, 'docs', 'index.html')).href,
    remove: () => rmSync(dir, { recursive: true, force: true })
  }
}
