import { changedKeys, checkpointWords, diffLine, entries } from './recordings.mjs'

export function expectedDiff ({ steps, before, after }) {
  const byStep = (file) => new Map((file?.checkpoints ?? []).map(({ step, state }) => [step, entries(state.join('\n'))]))
  const old = byStep(before)
  const now = byStep(after)
  return [...new Set([...old.keys(), ...now.keys()])].sort((a, b) => a - b).flatMap((step) => {
    const words = step === 0 || steps[step - 1] ? `step ${step} (${checkpointWords(steps, step)})` : `step ${step}`
    if (!now.has(step)) return [`${words}: a checkpoint only the old file has`]
    if (!old.has(step)) return [`${words}: a checkpoint only the new file has`]
    const w = old.get(step)
    const g = now.get(step)
    return changedKeys(w, g).map((key) => `${words}: ${diffLine(key, w, g)}`)
  })
}
