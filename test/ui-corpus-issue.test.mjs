// The nightly UI corpus's report (`.github/workflows/ui-corpus.yml`): a planted differing recording in the run's
// log files one issue naming it, a second red night comments on that issue, and a night that compared nothing or did not
// run is red too. Through a stub `gh`; the workflow's own run on GitHub is proven only by a scheduled run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { stubGh } from './stub-gh.mjs'

const script = (name) => fileURLToPath(new URL(`../.github/scripts/${name}`, import.meta.url))
const workflow = (name) => readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8')
const REPORT = script('ui-corpus-issue.sh')
const RAN = script('ui-corpus-ran.sh')
const TITLE = 'UI corpus failed'
const RUN_URL = 'https://github.com/owner/repo/actions/runs/9'
const TEST = (id) => `replays ${id} through mouse and keyboard to the engine driver's states`
const PASSING_LOG = `  ✔ ${TEST('genre/a')} (8ms)\n  ✔ ${TEST('genre/b')} (9ms)\n`
const DIFFERING_LOG = [
  PASSING_LOG,
  `  ✖ ${TEST('genre/fillmat')} (9382ms)`,
  `  ✖ ${TEST('genre/hitori')} (9643ms)`,
  '✖ failing tests:',
  '',
  'test at live/ui-replay-0.live.mjs:70:9',
  `✖ ${TEST('genre/fillmat')} (9382ms)`,
  '  AssertionError: genre/fillmat: step 14 differs from the engine driver',
  'test at live/ui-replay-1.live.mjs:70:9',
  `✖ ${TEST('genre/hitori')} (9643ms)`,
  ''
].join('\n')

function runReport ({ log, result, env: extraEnv, ...stub }) {
  const { dir, env, calls } = stubGh(stub)
  const logFile = join(dir, 'ui-corpus.log')
  if (log !== undefined) writeFileSync(logFile, log)
  const { status, stderr } = spawnSync('bash', [REPORT, logFile, result, RUN_URL], { env: { ...env, ...extraEnv }, encoding: 'utf8' })
  return { status, stderr, writes: calls().filter(([, verb]) => verb !== 'list') }
}

describe('a red night', () => {
  it('files one issue naming each differing recording once, and the run', () => {
    const { status, stderr, writes } = runReport({ log: DIFFERING_LOG, result: 'failure' })
    assert.equal(status, 0, stderr)
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0].slice(0, 8), ['issue', 'create', '--repo', 'owner/repo', '--label', 'bug,needs-info', '--title', TITLE])
    const body = writes[0][9]
    assert.equal(body.match(/`genre\/fillmat`/g).length, 1)
    assert.match(body, /- `genre\/hitori`\n/)
    assert.doesNotMatch(body, /genre\/a\b/)
    assert.match(body, new RegExp(`Run: ${RUN_URL}`))
  })

  it('comments on the open issue instead of filing a second', () => {
    const { writes } = runReport({ log: DIFFERING_LOG, result: 'failure', listOutput: `31\t${TITLE}\n` })
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0].slice(0, 5), ['issue', 'comment', '31', '--repo', 'owner/repo'])
    assert.match(writes[0][6], /genre\/fillmat/)
  })

  it('is filed when the run failed and left no recording named, saying so', () => {
    const { writes } = runReport({ log: 'Error: browser did not start\n', result: 'failure' })
    assert.match(writes[0][9], /No recording is named in the log; read the run\./)
  })

  for (const result of ['failure', 'success']) {
    it(`is filed, saying the log is missing, when a ${result} run left no log`, () => {
      const { writes } = runReport({ result })
      assert.equal(writes[0][1], 'create')
      assert.match(writes[0][9], /log is missing/)
      assert.doesNotMatch(writes[0][9], /compared no recording/)
    })
  }

  for (const result of ['cancelled', 'skipped']) {
    it(`is filed when the run's result is ${result}`, () => {
      const { writes } = runReport({ log: PASSING_LOG, result })
      assert.equal(writes[0][1], 'create')
      assert.match(writes[0][9], new RegExp(`result was ${result}`))
    })
  }
})

// node's own report of a differing recording, read under the C locale a runner might not set UTF-8 in.
describe('the report on node\'s real output', () => {
  const fixture = [
    "import { describe, it } from 'node:test'",
    "describe('the UI driver on solve.html', () => {",
    `  it(${JSON.stringify(TEST('genre/real-diff'))}, () => { throw new Error('differs') })`,
    `  it(${JSON.stringify(TEST('genre/real-same'))}, () => {})`,
    '})'
  ].join('\n')
  const nodeLog = () => {
    const dir = mkdtempSync(join(tmpdir(), 'ui-corpus-fixture-'))
    writeFileSync(join(dir, 'fixture.test.mjs'), fixture)
    return spawnSync(process.execPath, ['--test', join(dir, 'fixture.test.mjs')], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined, LC_ALL: 'C' } }).stdout
  }

  it('names the differing recording once and not the one that agreed', () => {
    const { writes } = runReport({ log: nodeLog(), result: 'failure', env: { LC_ALL: 'C' } })
    assert.match(writes[0][9], /- `genre\/real-diff`\n/)
    assert.doesNotMatch(writes[0][9], /real-same/)
  })

  it('counts both recordings compared on a green night', () => {
    const log = nodeLog().replace(/✖/g, '✔')
    const { writes } = runReport({ log, result: 'success', listOutput: `31\t${TITLE}\n`, env: { LC_ALL: 'C' } })
    assert.match(writes[0][6], /2 comparisons/)
  })
})

describe('a night that compared nothing', () => {
  it('is red when the run succeeded but the log holds no comparison', () => {
    const { writes } = runReport({ log: 'ℹ tests 0\nℹ pass 0\n', result: 'success' })
    assert.equal(writes.length, 1)
    assert.equal(writes[0][1], 'create')
    assert.match(writes[0][9], /compared no recording/)
  })
})

describe('a green night', () => {
  it('files nothing when no issue is open', () => {
    const { status, writes } = runReport({ log: PASSING_LOG, result: 'success' })
    assert.equal(status, 0)
    assert.deepEqual(writes, [])
  })

  it('says so on the open issue, naming how many recordings it compared', () => {
    const { writes } = runReport({ log: PASSING_LOG, result: 'success', listOutput: `31\t${TITLE}\n` })
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0].slice(0, 5), ['issue', 'comment', '31', '--repo', 'owner/repo'])
    assert.match(writes[0][6], /green/)
    assert.match(writes[0][6], /2 comparisons/)
  })
})

function runRan (createdAt) {
  const { env, calls } = stubGh({ runListOutput: createdAt })
  const { status, stderr } = spawnSync('bash', [RAN, RUN_URL], { env, encoding: 'utf8' })
  return { status, stderr, writes: calls().filter(([noun, verb]) => noun === 'issue' && verb !== 'list') }
}

describe('a night the workflow did not run', () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString()

  it('is filed when the last scheduled run is older than a day and a half', () => {
    const { status, stderr, writes } = runRan(hoursAgo(40))
    assert.equal(status, 0, stderr)
    assert.equal(writes.length, 1)
    assert.match(writes[0][9], /did not run/)
  })

  it('is filed when no scheduled run exists', () => {
    assert.equal(runRan('').writes.length, 1)
  })

  it('files nothing when the last scheduled run is recent', () => {
    assert.deepEqual(runRan(hoursAgo(20)).writes, [])
  })
})

describe('the workflows', () => {
  it('has the corpus step run under pipefail, so a differing recording fails the job the report reads', () => {
    assert.match(workflow('ui-corpus.yml'), /- shell: bash\n {8}run: \|\n {10}node --test .*\| tee /)
  })

  it('has the report download the artifact the corpus uploads', () => {
    const corpus = workflow('ui-corpus.yml')
    const [, uploaded] = /upload-artifact@[^\n]*\n\s+with:\n\s+name: (\S+)/.exec(corpus)
    assert.match(corpus, new RegExp(`download-artifact@[^\\n]*\\n(?:.*\\n)*?\\s+name: ${uploaded}\\n`))
  })

  it('has the check that the corpus ran run on every night, with no condition', () => {
    const job = /\n {2}ui-corpus-ran:\n((?: {4}.*\n| *\n)*)/.exec(workflow('nightly.yml'))[1]
    assert.doesNotMatch(job, /^ {4}if:/m)
  })

  it('has the UI corpus report its run, even when the run failed', () => {
    const corpus = workflow('ui-corpus.yml')
    assert.match(corpus, /needs: ui-corpus\n\s+if: always\(\)/)
    assert.match(corpus, /ui-corpus-issue\.sh .*\$\{\{ needs\.ui-corpus\.result \}\}/)
  })

  it('has the nightly check that the UI corpus ran', () => {
    assert.match(workflow('nightly.yml'), /ui-corpus-ran\.sh/)
  })
})
