// The pages do not name Swaroop or upstream as their owner (#375, spec #373 Identity): popup titles, page titles and share previews.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AKARI_SOLVE, openPenpa, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

const FORK_ADDRESS = 'https://caneff.github.io/penpa-edit/'
const PAGES = [['index.html', { solve: false }], ['solve.html', { solve: true }]]

// Runs in the page: the head's title and every `og:`/`twitter:` meta, as [name, content] pairs.
function headIdentity () {
  const metas = [...document.head.querySelectorAll('meta')]
    .map((m) => [m.getAttribute('property') ?? m.getAttribute('name'), m.content])
    .filter(([name]) => /^(og|twitter):/.test(name))
  return { title: document.title, metas }
}

describe('the page head', () => {
  for (const [name, options] of PAGES) {
    it(`${name} names ChinStrap and the fork's address, and nothing of swaroopg92 or Penpa+, in its title and share meta`, async () => {
      const { context, page } = await openPenpa(browser(), name === 'solve.html' ? AKARI_SOLVE : '', { served: true, ...options })
      try {
        const head = await page.evaluate(headIdentity)
        assert.equal(head.title.includes('ChinStrap'), true, `title: ${head.title}`)
        const byName = Object.fromEntries(head.metas)
        assert.equal(byName['og:title'], 'ChinStrap')
        assert.equal(byName['twitter:title'], 'ChinStrap')
        assert.equal(byName['og:url'], FORK_ADDRESS)
        assert.equal(byName['twitter:url'], FORK_ADDRESS)
        assert.equal(byName['twitter:domain'], 'caneff.github.io')
        assert.doesNotMatch(JSON.stringify(head), /swaroop|Penpa\+/i)
      } finally {
        await context.close()
      }
    })
  }
})

describe('a popup', () => {
  for (const [name, options] of PAGES) {
    for (const kind of ['errorMsg', 'infoMsg']) {
      it(`${kind} on ${name} is titled ChinStrap, not Swaroop`, async () => {
        const { context, page } = await openPenpa(browser(), name === 'solve.html' ? AKARI_SOLVE : '', { served: true, ...options })
        try {
          await page.evaluate((fn) => window[fn]('A message'), kind)
          const title = () => page.locator('.swal2-title').textContent()
          assert.equal(await settle(title, 'ChinStrap says'), 'ChinStrap says')
          assert.doesNotMatch(await page.locator('.swal2-popup').textContent(), /swaroop/i)
        } finally {
          await context.close()
        }
      })
    }
  }
})

describe('the puzzle title', () => {
  it('ends the tab title with ChinStrap, not Penpa+', async () => {
    const { context, page } = await openPenpa(browser(), '', { served: true })
    try {
      const title = await page.evaluate(() => { document.getElementById('saveinfotitle').value = 'Mine'; update_title(); return document.title })
      assert.equal(title, 'Mine - ChinStrap')
    } finally {
      await context.close()
    }
  })
})
