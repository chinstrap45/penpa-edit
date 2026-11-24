// The Bash-command reading both PreToolUse hooks share (#447): splitting a command into segments that follow `cd`, the
// words of a segment, the parse of the call on stdin, and the deny reply. A fix here reaches both hooks.
import { resolve } from 'node:path'

// Words that run the command after them.
const PREFIXES = new Set(['env', 'npx', 'command', 'exec'])

export const unquote = (word) => word.replace(/^(['"])(.*)\1$/, '$2')

// The command a segment runs, with the variable assignments and prefixes before it dropped.
export function commandWords (segment) {
  const words = segment.trim().split(/\s+/).filter(Boolean).map(unquote)
  while (words.length && (PREFIXES.has(words[0]) || /^\w+=/.test(words[0]))) words.shift()
  return words
}

// Whether `test(segment, words, cwd)` is true for any segment of `command`, in order. A `cd <dir>` segment moves `cwd`
// for the segments after it and is not itself tested.
export function someSegment (startCwd, command, test) {
  let cwd = startCwd
  return command.split(/&&|\|\||[;|\n]/).some((segment) => {
    const words = commandWords(segment)
    if (words[0] === 'cd' && words[1]) {
      cwd = resolve(cwd, words[1])
      return false
    }
    return test(segment, words, cwd)
  })
}

// The call Claude Code sent on stdin: its `cwd` (default: the project), `tool` and `args`; null when `raw` is not JSON,
// which each hook decides on, since a call it cannot read is denied, not let through.
export function parseCall (raw) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return null
  }
  const { cwd = process.env.CLAUDE_PROJECT_DIR, tool_name: tool, tool_input: args = {} } = input ?? {}
  return { cwd, tool, args: args ?? {} }
}

export function writeDeny (reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }
  }))
}
