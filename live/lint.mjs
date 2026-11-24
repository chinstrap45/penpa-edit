// The lint (#396): StandardJS over the JavaScript and shellcheck (error severity) over the shell scripts that
// `.gitattributes` marks `merge=ours`, so an upstream merge never meets a style change of ours.
// StandardJS comes from `node_modules`; shellcheck is the system's, found on PATH (`sudo apt-get install shellcheck`; GitHub's
// ubuntu runners ship it), never a copy downloaded while the lint runs (Chris, 2026-11-24, #416).
// Usage: node live/lint.mjs   (from the repo root; exits non-zero on a finding, a missing tool or an empty scope)
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const JS_EXTENSIONS = ['.js', '.mjs']
export const SHELL_EXTENSIONS = ['.sh']
// Owned files StandardJS must not read: a vendored bundle and a file `live/generate-gallery.mjs` writes.
export const NOT_LINTED = ['docs/ui/vendor/', 'docs/gallery-puzzles.js']

const git = (root, args, input) => {
  const out = spawnSync('git', args, { cwd: root, input, encoding: 'utf8', maxBuffer: 1 << 28 })
  if (out.status !== 0) throw new Error(`git ${args.join(' ')}: ${out.error?.message ?? out.stderr}`)
  return out.stdout
}

// Every file git tracks or would add (an untracked one counts: the seam runs before the commit) that `.gitattributes` gives `merge=ours`, asked of git itself so no pattern is read twice.
export function ownedFiles (root) {
  const tracked = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)
  const attrs = git(root, ['check-attr', '-z', '--stdin', 'merge'], tracked.join('\0') + '\0').split('\0')
  const owned = []
  for (let i = 0; i + 2 < attrs.length; i += 3) {
    if (attrs[i + 2] === 'ours') owned.push(attrs[i])
  }
  return owned
}

export const isNotLinted = (file) => NOT_LINTED.some((path) => file === path || (path.endsWith('/') && file.startsWith(path)))

const hasExtension = (file, extensions) => extensions.some((ext) => file.endsWith(ext))

export function lintScope (root) {
  const owned = ownedFiles(root)
  return {
    owned,
    js: owned.filter((file) => hasExtension(file, JS_EXTENSIONS) && !isNotLinted(file)),
    shell: owned.filter((file) => hasExtension(file, SHELL_EXTENSIONS))
  }
}

// A tool that is not installed is a failure, never a pass.
function bin (root, name) {
  const path = join(root, 'node_modules/.bin', name)
  if (!existsSync(path)) throw new Error(`${name} is not installed (${path}): run npm ci`)
  return path
}

// StandardJS ignores every path under a dot-directory (`.github/`), and no flag lifts that for a named file, so
// those files go through `--stdin`, named in its output by their own path.
const underDotDirectory = (file) => file.split('/').slice(0, -1).some((part) => part.startsWith('.'))

function standard (root, files) {
  const tool = bin(root, 'standard')
  const direct = files.filter((file) => !underDotDirectory(file))
  const failures = []
  if (direct.length) {
    const out = spawnSync(tool, direct, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    if (out.error || out.status !== 0) failures.push(out.error?.message ?? out.stdout + out.stderr)
  }
  for (const file of files.filter(underDotDirectory)) {
    const source = readFileSync(join(root, file), 'utf8')
    const out = spawnSync(tool, ['--stdin'], { cwd: root, input: source, encoding: 'utf8' })
    if (out.error || out.status !== 0) failures.push((out.error?.message ?? out.stdout + out.stderr).replaceAll('<text>', file))
  }
  return failures
}

function shellcheck (root, files, env) {
  const out = spawnSync('shellcheck', ['--severity=error', ...files], { cwd: root, env, encoding: 'utf8' })
  if (out.error?.code === 'ENOENT') throw new Error('shellcheck is not installed on PATH: run sudo apt-get install shellcheck')
  return out.error || out.status !== 0 ? [out.error?.message ?? out.stdout + out.stderr] : []
}

// Each tool runs whatever the other did, so one tool's failure never hides the other's findings.
const attempt = (run) => {
  try {
    return run()
  } catch (error) {
    return [error.message]
  }
}

// Returns the lines to print for a failure; an empty list is a pass. `env` is shellcheck's environment, its PATH where it is looked up.
export function runLint (root, env = process.env) {
  const scope = attempt(() => lintScope(root))
  if (Array.isArray(scope)) return [`lint scope unreadable: ${scope[0]}`]
  if (!scope.js.length || !scope.shell.length) {
    return [`lint scope is empty (${scope.js.length} JavaScript files, ${scope.shell.length} shell scripts): .gitattributes marks nothing`]
  }
  return [...attempt(() => standard(root, scope.js)), ...attempt(() => shellcheck(root, scope.shell, env))]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = runLint(process.cwd())
  for (const failure of failures) console.error(failure)
  if (failures.length) process.exitCode = 1
  else console.log('lint: StandardJS and shellcheck clean')
}
