// `useBrowser`'s page-error check, run on a scratch test file in a child runner: every live file leans on it to fail a test
// whose page logged an error, and no live test can show it failing.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { ENV, tree } from './live-scratch.mjs'

const PAGE = new URL('../live/page.mjs', import.meta.url).href

// A page with `script` in it, opened through `openPenpa` so its errors are collected.
const SCRATCH = `
import { it } from 'node:test'
import { openPenpa, useBrowser } from '${PAGE}'

const browser = useBrowser()
const open = (script = '') => openPenpa(browser(), '', { url: 'data:text/html,<script>' + script + '</script>', ready: () => true })

it('clean', async (t) => {
  const { context } = await open()
  t.after(() => context.close())
})

it('logs an error', async (t) => {
  const { context } = await open('console.error("planted")')
  t.after(() => context.close())
})

it('logs an error in its own after hook', async (t) => {
  const { context, page } = await open()
  t.after(async () => {
    await page.evaluate(() => console.error('planted late'))
    await context.close()
  })
})
`

describe('useBrowser', () => {
  it('fails a test whose page logged a console.error, also from the test\'s own after hook, and passes a clean one', () => {
    const dir = tree({ 'scratch.test.mjs': SCRATCH })
    const out = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(dir, 'scratch.test.mjs')], { cwd: dir, env: ENV, encoding: 'utf8' })
    const verdict = (name) => out.stdout.match(new RegExp(`^(ok|not ok) \\d+ - ${name}$`, 'm'))?.[1]
    assert.deepEqual(
      ['clean', 'logs an error', 'logs an error in its own after hook'].map(verdict),
      ['ok', 'not ok', 'not ok'],
      out.stdout + out.stderr)
    assert.match(out.stdout, /no page error or console\.error/)
  })
})
