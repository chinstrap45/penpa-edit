// index.html forwards a solve link to solve.html on a desktop-sized screen (#376, spec #373 § Forwarding), with the same
// query or `#` data, by `location.replace` so Back does not return to it. A phone-sized screen, an edit link and a link
// the solve page's Penpa+ button marked stay on index.html. Served over one origin, as Pages serves both pages; the board
// is compared by its givens, read the same way on both pages.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { DESK_SIZE, makeNumberSolveLink, openPenpa, PENPA_MARK, PENPA_ORIGIN, useBrowser, waitForDesk } from './page.mjs'

const browser = useBrowser()

// A phone held upright: under the 768 px a desktop screen has at least.
const PHONE_SIZE = { viewport: { width: 390, height: 844 } }

const givens = (page) => page.evaluate(() => JSON.parse(JSON.stringify(pu.pu_q.number)))
const pathOf = (page) => new URL(page.url()).pathname
const dataOf = (page) => { const url = new URL(page.url()); return url.search + url.hash }

// Opens `data` on the served index.html in a fresh context of `contextOptions`, after a blank page so Back has
// somewhere to go, and returns once Penpa+ (`pu`) is up on whichever page the load ended on.
async function openIndex (data, contextOptions = DESK_SIZE) {
  const { context, page } = await openPenpa(browser(), '', { served: true, contextOptions })
  await page.goto('about:blank')
  await page.goto(`${PENPA_ORIGIN}/index.html${data}`)
  await page.waitForFunction(() => typeof pu !== 'undefined' && pu.url)
  return { context, page }
}

describe('a solve link opened on index.html', () => {
  let hashLink
  let expectedGivens
  before(async () => {
    hashLink = await makeNumberSolveLink(browser())
    const { context, page } = await openPenpa(browser(), hashLink, { served: true, solve: true, contextOptions: DESK_SIZE })
    try {
      await waitForDesk(page)
      expectedGivens = await givens(page)
    } finally {
      await context.close()
    }
  })

  for (const form of ['#', '?']) {
    it(`lands on solve.html with its data and the same board on a desktop screen, in ${form} form`, async (t) => {
      const data = form + hashLink.slice(1)
      const { context, page } = await openIndex(data)
      t.after(() => context.close())
      await waitForDesk(page)
      assert.equal(pathOf(page), '/solve.html', 'the page is the solve page')
      assert.equal(dataOf(page), data, 'the link\'s data came along unchanged')
      assert.deepEqual(await givens(page), expectedGivens, 'the board is the one the link holds')
    })
  }

  it('leaves no index.html entry for Back to return to', async (t) => {
    const { context, page } = await openIndex(hashLink)
    t.after(() => context.close())
    await waitForDesk(page)
    await page.goBack()
    assert.equal(page.url(), 'about:blank', 'Back goes to the page before the link')
  })

  it('stays on index.html on a phone-sized screen', async (t) => {
    const { context, page } = await openIndex(hashLink, PHONE_SIZE)
    t.after(() => context.close())
    assert.equal(pathOf(page), '/index.html')
    assert.deepEqual(await givens(page), expectedGivens)
  })

  it('stays on index.html on a touch screen, whatever its width', async (t) => {
    const { context, page } = await openIndex(hashLink, { ...DESK_SIZE, hasTouch: true })
    t.after(() => context.close())
    assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'the screen reads as touch')
    assert.equal(pathOf(page), '/index.html')
  })

  it('stays on index.html when the solve page\'s Penpa+ button marked it, in either form', async (t) => {
    for (const data of [`${hashLink}&${PENPA_MARK}`, `?${hashLink.slice(1)}&${PENPA_MARK}`]) {
      const { context, page } = await openIndex(data)
      t.after(() => context.close())
      assert.equal(pathOf(page), '/index.html', data)
      assert.deepEqual(await givens(page), expectedGivens, 'the mark leaves the board as the link holds it')
    }
  })
})

// Penpa+ reads a link's settings from its query, or from its `#` data when it has no query, so a link with both is a solve
// only when its query says so. The forward and the Back to new UI button must agree on that (#430): a link the page is
// forwarded away from needs no button, and one it stays on as a solve needs it.
describe('a link with both a query and `#` data opened on index.html', () => {
  let hashLink
  before(async () => { hashLink = await makeNumberSolveLink(browser()) })

  const hasButton = (page) => page.evaluate(() => Boolean(document.querySelector('#top_button #chinstrap')))

  it('is no solve when only its `#` data says so: no forward, no button', async (t) => {
    const { context, page } = await openIndex(`?x=1${hashLink}`)
    t.after(() => context.close())
    assert.equal(pathOf(page), '/index.html', 'the page stays')
    assert.equal(await hasButton(page), false, 'and has no button back')
  })

  it('is a solve when its query says so: forwarded, and kept on index.html by the mark with the button', async (t) => {
    const query = `?${hashLink.slice(1)}`
    const forwarded = await openIndex(`${query}#m=edit`)
    t.after(() => forwarded.context.close())
    await waitForDesk(forwarded.page)
    assert.equal(pathOf(forwarded.page), '/solve.html', 'the query alone decides the forward')
    const kept = await openIndex(`${query}&${PENPA_MARK}#m=edit`)
    t.after(() => kept.context.close())
    assert.equal(pathOf(kept.page), '/index.html', 'the mark in the query keeps the page')
    assert.equal(await hasButton(kept.page), true, 'a page held as a solve has the button')
  })
})

describe('an edit link opened on index.html', () => {
  it('stays on index.html on a desktop screen', async (t) => {
    const link = await makeNumberSolveLink(browser())
    const editLink = link.replace('m=solve', 'm=edit')
    const { context, page } = await openIndex(editLink)
    t.after(() => context.close())
    assert.equal(pathOf(page), '/index.html')
  })
})
