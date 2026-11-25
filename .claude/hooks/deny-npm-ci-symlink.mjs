// PreToolUse hook (#240): `npm ci` is allowed without a prompt (#239), but a worker's `node_modules` is a symlink to the
// primary checkout's, and `npm ci` through the link removes it and empties the primary's, which every worktree shares.
// So a Bash call that runs `npm ci` in a directory whose `node_modules` is a symlink is denied. The directory is the
// cwd, followed through `cd`, or the `--prefix` value. Other forms of the same wipe (a script that runs npm itself) are not seen.
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCall, someSegment, writeDeny } from './command-parser.mjs'

const REASON = '`npm ci` through a symlinked node_modules empties the primary checkout\'s node_modules, which every ' +
  'worktree shares. Run `rm node_modules` first (the link only, never rm -r), then npm ci.'
// npm's spellings of `ci`.
const CI = new Set(['ci', 'clean-install', 'ic', 'install-clean', 'isntall-clean'])

// False only when `path` is known not to be a link: absent, or read and found not to be one.
function mayBeSymlink (path) {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false // no node_modules there: nothing to wipe
    return true // unreadable (permissions, I/O): it may be one
  }
}

function wipesLink (startCwd, command) {
  return someSegment(startCwd, command, (segment, [name, sub, ...args], cwd) => {
    if (name !== 'npm' || !CI.has(sub)) return false
    const at = args.indexOf('--prefix')
    const prefix = at >= 0 ? args[at + 1] : args.find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length)
    return mayBeSymlink(resolve(cwd, prefix ?? '.', 'node_modules'))
  })
}

function denied (raw) {
  const call = parseCall(raw)
  if (!call) return true // a call this hook cannot read is denied, not let through
  return call.tool === 'Bash' && wipesLink(call.cwd, call.args.command ?? '')
}

if (denied(readFileSync(0, 'utf8'))) writeDeny(REASON)
