// The expected-file gate (#33, `.github/scripts/expected-gate.mjs`) on hand-built inputs: which changed expected files a
// PR's tickets listed in advance, and the plain-words diff its PR comment carries. The GitHub and git calls that feed
// it are proven by the PR runs of `.github/workflows/ci.yml`; the `main` describe below runs the script itself on a
// scratch repo with a stubbed `gh`.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'
import { DIFF_LINES, commentBody, gateVerdict, listedIds } from '../.github/scripts/expected-gate.mjs'
import { expectedDiff } from '../live/expected-diff.mjs'
import { stubGh } from './stub-gh.mjs'

const LISTING = (...lines) => `Fix the thing.\n\n## Expected changes\n\n${lines.join('\n')}\n\n## Acceptance\n\n- \`genre/not-a-listing\`: no\n`

describe('listedIds', () => {
  it('reads the first backticked id of each bullet under "## Expected changes", and nothing outside it', () => {
    const body = LISTING('- `genre/box`: the cage loses its sum', '- `paint/surface-drag` keeps its shading')
    assert.deepEqual([...listedIds(body)].sort(), ['genre/box', 'paint/surface-drag'])
  })

  it('reads nothing from a body with no such section', () => {
    assert.deepEqual([...listedIds('- `genre/box`: changed\n')], [])
  })
})

const T0 = '2026-11-10T00:00:00Z'
const T1 = '2026-11-11T00:00:00Z'
const T2 = '2026-11-12T00:00:00Z'

describe('gateVerdict', () => {
  const ticket = (number, ...versions) => ({ number, versions: versions.map(([at, body]) => ({ at, body })) })

  it('approves a changed expected file its ticket listed before the fix started', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/box`: x')])]
    })
    assert.deepEqual(verdict, { approved: [{ id: 'genre/box', ticket: 40 }], added: [], unlisted: [] })
  })

  it('fails a changed expected file no ticket lists', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/nanro`: x')])]
    })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }])
    assert.deepEqual(verdict.approved, [])
  })

  it('fails a change whose id was added to the ticket only after the fix started', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/nanro`: x')], [T2, LISTING('- `genre/nanro`: x', '- `genre/box`: y')])]
    })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: `#40 listed it at ${T2}, after the fix started at ${T1}` }])
  })

  it('fails a change whose id the ticket listed in advance but no longer lists', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, LISTING('- `genre/box`: x')], [T2, LISTING('- `genre/nanro`: x')])]
    })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }])
  })

  it('counts a deleted expected file as a change to list', () => {
    const verdict = gateVerdict({ changes: [{ id: 'genre/box', status: 'deleted' }], fixStartedAt: T1, tickets: [] })
    assert.deepEqual(verdict.unlisted, [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }])
  })

  it('passes a new expected file unlisted, as an added one, not a re-approval', () => {
    const verdict = gateVerdict({ changes: [{ id: 'genre/new-one', status: 'added' }], fixStartedAt: T1, tickets: [] })
    assert.deepEqual(verdict, { approved: [], added: ['genre/new-one'], unlisted: [] })
  })

  it('reads the listing from any ticket the PR closes', () => {
    const verdict = gateVerdict({
      changes: [{ id: 'genre/box', status: 'modified' }],
      fixStartedAt: T1,
      tickets: [ticket(40, [T0, 'no listing']), ticket(41, [T0, LISTING('- `genre/box`: x')])]
    })
    assert.deepEqual(verdict.approved, [{ id: 'genre/box', ticket: 41 }])
  })
})

describe('commentBody', () => {
  const verdict = {
    unlisted: [{ id: 'genre/box', reason: 'no ticket this PR closes lists it' }],
    approved: [{ id: 'genre/nanro', ticket: 40 }],
    added: ['genre/new-one']
  }
  const sections = new Map([
    ['genre/box', ['step 2 (left up at point 12): pu_q.surface: {} → {"12":1}']],
    ['genre/nanro', Array.from({ length: DIFF_LINES + 3 }, (_, i) => `line ${i + 1}`)],
    ['genre/new-one', ['a new expected file of 4 checkpoints']]
  ])
  const body = commentBody({ head: 'abc123', verdict, sections })

  it('puts each recording under its verdict, with its reason or ticket and its diff lines', () => {
    assert.match(body, /^## Expected-file gate at abc123$/m)
    assert.match(body, /### Not listed in advance: this check fails\n\n#### `genre\/box` — no ticket this PR closes lists it\n\n- step 2 \(left up at point 12\): pu_q\.surface: \{\} → \{"12":1\}\n/)
    assert.match(body, /### Approved\n\n#### `genre\/nanro` — listed in #40\n/)
    assert.match(body, /### New recordings\n\n#### `genre\/new-one`\n\n- a new expected file of 4 checkpoints\n/)
  })

  it('cuts a long diff and says how many lines it left out', () => {
    assert.match(body, new RegExp(`^- line ${DIFF_LINES}$`, 'm'))
    assert.doesNotMatch(body, new RegExp(`^- line ${DIFF_LINES + 1}$`, 'm'))
    assert.match(body, /^- … and 3 more lines: `git diff` the file to see them all$/m)
  })
})

describe('expectedDiff', () => {
  const steps = [
    { kind: 'pointer', action: 'down', button: 'left', ctrl: false, x: 1, y: 1, num: 12 },
    { kind: 'pointer', action: 'up', button: 'left', ctrl: false, x: 1, y: 1, num: 12 },
    { kind: 'key', call: 'key_number', args: ['3'] }
  ]
  const file = (...checkpoints) => ({ checkpoints: checkpoints.map(([step, state]) => ({ step, state })) })

  it('says per checkpoint which keys changed, from what to what, with the step in words', () => {
    const before = file([0, ['pu_q.surface = {}', 'sol_flag = 0']], [2, ['pu_q.surface = {}', 'sol_flag = 0']])
    const after = file([0, ['pu_q.surface = {}', 'sol_flag = 0']], [2, ['pu_q.surface = {"12":1}', 'sol_flag = 0']])
    assert.deepEqual(expectedDiff({ steps, before, after }), [
      'step 2 (left up at point 12): pu_q.surface: {} → {"12":1}'
    ])
  })

  it('names a checkpoint only one file has, and a key only one side has as absent', () => {
    const before = file([0, ['a = 1']], [3, ['a = 1']])
    const after = file([0, ['a = 1', 'b = 2']], [2, ['a = 1']])
    assert.deepEqual(expectedDiff({ steps, before, after }), [
      'step 0 (the board the link loads): b: absent → 2',
      'step 2 (left up at point 12): a checkpoint only the new file has',
      'step 3 (key_number("3")): a checkpoint only the old file has'
    ])
  })

  it('reads a new or deleted file as all of its checkpoints added or removed', () => {
    assert.deepEqual(expectedDiff({ steps, before: null, after: file([0, ['a = 1']]) }), [
      'step 0 (the board the link loads): a checkpoint only the new file has'
    ])
  })
})

// `main` and `diffLines` end to end: the script runs as `ci.yml` runs it, in a scratch git repo laid out like the fork's
// (`live/recordings/<id>.expected.json` beside its steps file), with `gh` stubbed to answer `pr view` and the ticket's
// body edits.
describe('main, on a scratch repo with a stubbed gh', () => {
  const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'scripts', 'expected-gate.mjs')
  const DIR = 'live/recordings/genre'
  const STEPS = [{ kind: 'key', call: 'key_number', args: ['3'] }]
  const expected = (...states) => JSON.stringify({ checkpoints: states.map((state, step) => ({ step, state })) })
  const COMMIT_DAY = '2026-11-11T12:00:00Z'
  const EDIT_BEFORE = '2026-11-10T12:00:00Z'
  const EDIT_AFTER = '2026-11-12T12:00:00Z'
  const LATER_DAY = '2026-11-13T12:00:00Z'
  const ROOT = mkdtempSync(join(tmpdir(), 'expected-gate-'))
  after(() => rmSync(ROOT, { recursive: true, force: true }))

  // Base: `box` and `gone` (each with `a = 1`) and `kept`; the head commit is `change(write)`'s result. With `later`,
  // one more commit dated LATER_DAY follows it, adding a file that is no expected file.
  function scratchRepo (change, later) {
    const root = mkdtempSync(join(ROOT, 'repo-'))
    let day = COMMIT_DAY
    const git = (...args) => execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_AUTHOR_DATE: day, GIT_COMMITTER_DATE: day }
    })
    const write = (id, suffix, text) => {
      mkdirSync(join(root, DIR), { recursive: true })
      writeFileSync(join(root, `live/recordings/${id}${suffix}`), text)
    }
    git('init', '-q', '-b', 'master')
    for (const id of ['genre/box', 'genre/gone', 'genre/kept']) {
      write(id, '.steps.json', JSON.stringify({ steps: STEPS }))
      write(id, '.expected.json', expected(['a = 1']))
    }
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    const base = git('rev-parse', 'HEAD').trim()
    change({ write, remove: (id) => git('rm', '-q', `live/recordings/${id}.expected.json`) })
    git('add', '-A')
    git('commit', '-q', '-m', 'head', '--allow-empty')
    if (later) {
      day = LATER_DAY
      writeFileSync(join(root, 'notes.txt'), 'later\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'later')
    }
    return { root, base, head: git('rev-parse', 'HEAD').trim() }
  }

  const ticket = (body, editedAt) => {
    const nodes = editedAt ? [{ editedAt, diff: body }] : []
    const issue = { body, createdAt: EDIT_BEFORE, userContentEdits: { totalCount: nodes.length, nodes } }
    return JSON.stringify({ data: { repository: { issue } } })
  }
  const closes = (...numbers) => JSON.stringify({ closingIssuesReferences: numbers.map((number) => ({ number, repository: { owner: { login: 'owner' }, name: 'repo' } })) })

  function runGate (repo, { prViewOutput = closes(), issueEdits = {} } = {}) {
    const { env, dir } = stubGh({ prViewOutput, issueEdits })
    const out = join(dir, 'github-output')
    const comment = join(dir, 'comment.md')
    writeFileSync(out, '')
    const run = spawnSync('node', [SCRIPT, '7', repo.base, repo.head, comment], { cwd: repo.root, env: { ...env, GITHUB_OUTPUT: out }, encoding: 'utf8' })
    const gate = { status: run.status, stdout: run.stdout, stderr: run.stderr, output: readFileSync(out, 'utf8'), comment: run.status === null ? '' : readFileSync(comment, 'utf8') }
    rmSync(dir, { recursive: true, force: true })
    return gate
  }

  it('with no expected file changed: changed=false, exit 0, and a comment saying so', () => {
    const repo = scratchRepo(() => {})
    const gate = runGate(repo)
    assert.equal(gate.status, 0)
    assert.equal(gate.output, 'changed=false\n')
    assert.match(gate.comment, /No expected file changed\./)
  })

  it('fails an unlisted modified expected file, naming its diff in words', () => {
    const repo = scratchRepo(({ write }) => write('genre/box', '.expected.json', expected(['a = 2'])))
    const gate = runGate(repo)
    assert.equal(gate.status, 1)
    assert.equal(gate.output, 'changed=true\n')
    assert.match(gate.stderr, /genre\/box: expected file changed, not listed in advance: no ticket this PR closes lists it/)
    assert.match(gate.comment, /#### `genre\/box` — no ticket this PR closes lists it\n\n- step 0 \(the board the link loads\): a: 1 → 2\n/)
  })

  it('passes a modified expected file a closed ticket listed before the fix started', () => {
    const repo = scratchRepo(({ write }) => write('genre/box', '.expected.json', expected(['a = 2'])))
    const body = 'Fix.\n\n## Expected changes\n\n- `genre/box`: a becomes 2\n'
    const gate = runGate(repo, { prViewOutput: closes(40), issueEdits: { 40: ticket(body, EDIT_BEFORE) } })
    assert.equal(gate.status, 0)
    assert.match(gate.comment, /### Approved\n\n#### `genre\/box` — listed in #40\n\n- step 0 \(the board the link loads\): a: 1 → 2\n/)
  })

  it('fails a modified expected file the ticket listed only after the fix started', () => {
    const repo = scratchRepo(({ write }) => write('genre/box', '.expected.json', expected(['a = 2'])))
    const body = 'Fix.\n\n## Expected changes\n\n- `genre/box`: a becomes 2\n'
    const gate = runGate(repo, { prViewOutput: closes(40), issueEdits: { 40: ticket(body, EDIT_AFTER) } })
    assert.equal(gate.status, 1)
    assert.match(gate.stderr, /#40 listed it at 2026-11-12T12:00:00\.000Z, after the fix started at 2026-11-11T12:00:00\.000Z/)
  })

  it('dates the fix from its earliest commit, so a ticket listing between two commits is after the fix started', () => {
    const repo = scratchRepo(({ write }) => write('genre/box', '.expected.json', expected(['a = 2'])), true)
    const body = 'Fix.\n\n## Expected changes\n\n- `genre/box`: a becomes 2\n'
    const gate = runGate(repo, { prViewOutput: closes(40), issueEdits: { 40: ticket(body, EDIT_AFTER) } })
    assert.equal(gate.status, 1)
    assert.match(gate.stderr, /#40 listed it at 2026-11-12T12:00:00\.000Z, after the fix started at 2026-11-11T12:00:00\.000Z/)
  })

  it('passes a new expected file unlisted, with a one-line summary of its checkpoints', () => {
    const repo = scratchRepo(({ write }) => {
      write('genre/fresh', '.steps.json', JSON.stringify({ steps: STEPS }))
      write('genre/fresh', '.expected.json', expected(['a = 1'], ['a = 2']))
    })
    const gate = runGate(repo)
    assert.equal(gate.status, 0)
    assert.equal(gate.output, 'changed=true\n')
    assert.match(gate.comment, /### New recordings\n\n#### `genre\/fresh`\n\n- a new expected file of 2 checkpoints\n/)
  })

  it('fails a deleted expected file no ticket lists, saying how many checkpoints it had', () => {
    const repo = scratchRepo(({ remove }) => remove('genre/gone'))
    const gate = runGate(repo)
    assert.equal(gate.status, 1)
    assert.match(gate.comment, /#### `genre\/gone` — no ticket this PR closes lists it\n\n- the expected file is deleted; it had 1 checkpoints\n/)
  })

  it('judges each file in a mixed change on its own: listed passes, unlisted fails, new passes', () => {
    const repo = scratchRepo(({ write }) => {
      write('genre/box', '.expected.json', expected(['a = 2']))
      write('genre/kept', '.expected.json', expected(['a = 3']))
      write('genre/fresh', '.steps.json', JSON.stringify({ steps: STEPS }))
      write('genre/fresh', '.expected.json', expected(['a = 1']))
    })
    const body = 'Fix.\n\n## Expected changes\n\n- `genre/box`: a becomes 2\n'
    const gate = runGate(repo, { prViewOutput: closes(40), issueEdits: { 40: ticket(body) } })
    assert.equal(gate.status, 1)
    assert.match(gate.stdout, /1 approved, 1 new, 1 not listed in advance/)
    assert.match(gate.comment, /#### `genre\/kept` — no ticket this PR closes lists it/)
    assert.match(gate.comment, /#### `genre\/box` — listed in #40/)
    assert.match(gate.comment, /#### `genre\/fresh`\n/)
  })

  it('says "no checkpoint changed" for a modified file whose checkpoints are the same', () => {
    const repo = scratchRepo(({ write }) => write('genre/box', '.expected.json', JSON.stringify({ checkpoints: [{ step: 0, state: ['a = 1'] }], note: 'reformatted' })))
    const gate = runGate(repo)
    assert.equal(gate.status, 1)
    assert.match(gate.comment, /- no checkpoint changed\n/)
  })
})
