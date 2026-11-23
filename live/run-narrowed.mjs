// The narrowed seam (#316): the lint (#396), the unit tests, then the live files CI would run for the same change, chosen by
// `live/run-live.mjs`. A detection that fails runs the full set, and says why there.
// Usage: node live/run-narrowed.mjs [--changed <ref>] [--list]
//   --changed <ref>  the change is the working tree against its merge base with <ref>; without it, the full set
//   --list           prints one suite per line (`npm run lint`, `npm test`, then each live file) instead of running them
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const RUN_LIVE = fileURLToPath(new URL('./run-live.mjs', import.meta.url))

function main () {
  const { values } = parseArgs({ options: { changed: { type: 'string' }, list: { type: 'boolean' } } })
  // Each step is what a run executes; `--list` names the same steps, so the two cannot drift apart.
  const checkSteps = [
    { name: 'npm run lint', command: 'npm', args: ['run', 'lint'] },
    { name: 'npm test', command: 'npm', args: ['test'] }
  ]
  const live = { command: process.execPath, args: [RUN_LIVE, ...(values.changed === undefined ? [] : ['--base', values.changed])] }
  const fail = (step, result) => {
    console.error(`${step}: ${result.error ? result.error.message : `exited ${result.status ?? result.signal}`}`)
    return result.status || 1
  }
  if (values.list) {
    const listing = spawnSync(live.command, [...live.args, '--list'], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' })
    if (listing.error || listing.status !== 0) return fail('listing the live files', listing)
    console.log([...checkSteps.map((step) => step.name), ...listing.stdout.split('\n').filter(Boolean)].join('\n'))
    return 0
  }
  for (const step of checkSteps) {
    const stepRun = spawnSync(step.command, step.args, { stdio: 'inherit' })
    if (stepRun.error || stepRun.status !== 0) return fail(step.name, stepRun)
  }
  const liveRun = spawnSync(live.command, live.args, { stdio: 'inherit' })
  return liveRun.error || liveRun.status !== 0 ? fail('the live files', liveRun) : 0
}

process.exitCode = main()
