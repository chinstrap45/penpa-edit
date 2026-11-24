// Recordings as files (GLOSSARY.md; the format is described at the top of `live/replay.mjs`): their paths, how they are
// read and written, and the helpers that put two canonical states side by side. It imports no browser library, so the
// expected-file gate (`.github/scripts/expected-gate.mjs`) loads no Playwright.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RECORDINGS = new URL('./recordings/', import.meta.url)
export const STEPS_SUFFIX = '.steps.json'
export const EXPECTED_SUFFIX = '.expected.json'

// A recording's file text, laid out as `docs/js/recorder.js` writes one: the header and the final board on a line
// each, then one step per line.
export function recordingText ({ header, final, steps }) {
  return '{"header": ' + JSON.stringify(header) + ',\n"final": ' + JSON.stringify(final) +
    ',\n"steps": [\n' + steps.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n'
}

// Writes the steps file of recording `id` under `root` (its folder made if need be), from the recording or from its
// file text as the recorder wrote it; returns the file's path.
export async function writeRecording (id, recording, root = RECORDINGS) {
  const file = new URL(id + STEPS_SUFFIX, root)
  await mkdir(dirname(fileURLToPath(file)), { recursive: true })
  await writeFile(file, typeof recording === 'string' ? recording : recordingText(recording))
  return fileURLToPath(file)
}

// The id of every recording under `live/recordings/`, sorted.
export async function listRecordings () {
  const files = await readdir(RECORDINGS, { recursive: true })
  return files.filter((f) => f.endsWith(STEPS_SUFFIX)).map((f) => f.slice(0, -STEPS_SUFFIX.length)).sort()
}

export async function readRecording (id) {
  return JSON.parse(await readFile(new URL(id + STEPS_SUFFIX, RECORDINGS), 'utf8'))
}

// The expected file as JSON reads it, or null when the recording has none.
export async function readExpectedFile (id, root = RECORDINGS) {
  try {
    return JSON.parse(await readFile(new URL(id + EXPECTED_SUFFIX, root), 'utf8'))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    return null
  }
}

// The expected checkpoints, each state back as the string `canonicalState` writes.
export async function readExpected (id, root = RECORDINGS) {
  const file = await readExpectedFile(id, root)
  if (!file) throw new Error(`${id} has no expected file: once the replay is right, run npm run recordings:approve -- ${id}`)
  return file.checkpoints.map(({ step, state }) => ({ step, state: state.join('\n') + '\n' }))
}

// A replay's checkpoints as the expected file holds them: each state one line per array entry, so a changed line reads
// as one line of the file's diff.
export function expectedFile (checkpoints) {
  return { checkpoints: checkpoints.map(({ step, state }) => ({ step, state: state.trimEnd().split('\n') })) }
}

export async function writeExpected (id, checkpoints, root = RECORDINGS) {
  await writeFile(new URL(id + EXPECTED_SUFFIX, root), JSON.stringify(expectedFile(checkpoints), null, 1) + '\n')
}

// A step in words, for a failure report.
export function stepWords (step) {
  switch (step.kind) {
    case 'pointer':
      return `${step.button ? step.button + ' ' : ''}${step.action}${step.ctrl ? ' with Ctrl' : ''} at point ${step.num}`
    case 'key':
      return `${step.call}(${step.args.map((a) => JSON.stringify(a)).join(', ')})`
    case 'mode':
      return `mode ${step.mode}, sub-mode ${JSON.stringify(step.submode)}, style ${step.style}${step.orientation ? `, orientation ${step.orientation}` : ''}`
    case 'select':
      return `select ${step.cells}`
    default:
      return step.kind
  }
}

// Step 0 is no input: its checkpoint is the board the link loads.
export function checkpointWords (steps, n) {
  return n === 0 ? 'the board the link loads' : stepWords(steps[n - 1])
}

// A canonical state as its lines' keys and values.
export function entries (state) {
  return new Map(state.split('\n').filter(Boolean).map((line) => {
    const at = line.indexOf(' = ')
    return [line.slice(0, at), line.slice(at + 3)]
  }))
}

// Every key whose value differs between two states, in the expected state's order, then the replay's new keys.
export function changedKeys (want, got) {
  return [...new Set([...want.keys(), ...got.keys()])].filter((k) => want.get(k) !== got.get(k))
}

// One changed key as `key: want → got`, a side that lacks it as `absent`; `want` and `got` are `entries` maps.
export function diffLine (key, want, got) {
  return `${key}: ${want.get(key) ?? 'absent'} → ${got.get(key) ?? 'absent'}`
}

// Lines a duplicate link drops by design, left out of the round trip's comparison: `maketext_duplicate` empties the
// redo stacks (class_p.js) and no link holds the selection.
const DUPLICATE_DROPS = /^(pu_a(_col)?\.command_redo\.length|selection) = .*$/

export function withoutDuplicateDrops (state) {
  return state.split('\n').filter((line) => !DUPLICATE_DROPS.test(line)).join('\n')
}
