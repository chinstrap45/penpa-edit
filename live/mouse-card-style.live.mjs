// The Mouse card is drawn like every other card (#411): its border, title bar and body background equal the Rules card's, no
// row has a fill, and the click labels are bold in the card's text colour, in the light and the dark theme.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { animationsDone, newBoardSolveLink, openSolvePage, useBrowser } from './page.mjs'
import { settle } from './settle.mjs'

const browser = useBrowser()

// Runs in the page: the computed look of one card's frame, its title bar and body.
function readLookInPage (name) {
  const card = document.querySelector(`section[aria-label="${name}"]`)
  const style = (node, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(node)[p]]))
  return {
    card: style(card, ['borderTopWidth', 'borderTopColor', 'backgroundColor', 'boxShadow']),
    head: style(card.querySelector('.ui-head'), ['backgroundColor', 'color', 'borderBottomColor']),
    body: style(card.querySelector('.ui-body'), ['backgroundColor'])
  }
}

describe('the Mouse card looks like its neighbours', () => {
  let opened
  afterEach(async () => { await opened?.context.close() })

  for (const theme of ['light', 'dark']) {
    it(`draws the frame, the title bar and the body like the Rules card's, and the rows with no fill, in the ${theme} theme`, async () => {
      opened = await openSolvePage(browser(), await newBoardSolveLink(browser(), undefined, 'Put a digit in every cell.'))
      const { page } = opened
      await page.evaluate((t) => engine.setTheme(t), theme)
      await settle(() => page.evaluate(() => document.documentElement.classList.contains('wa-dark')), theme === 'dark')
      await animationsDone(page)
      const mouse = await page.evaluate(readLookInPage, 'Mouse')
      const rules = await page.evaluate(readLookInPage, 'Rules')
      assert.deepEqual(mouse, rules)
      const rows = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Mouse"] .ui-mrow')].map((row) => ({
        fill: getComputedStyle(row).backgroundColor,
        more: row.classList.contains('is-more'),
        label: { weight: getComputedStyle(row.querySelector('.ui-mg')).fontWeight, color: getComputedStyle(row.querySelector('.ui-mg')).color },
        text: getComputedStyle(row).color
      })))
      assert.notEqual(rows.length, 0, 'the card has rows')
      for (const row of rows) {
        assert.equal(row.fill, 'rgba(0, 0, 0, 0)', 'a row has no fill')
        if (!row.more) {
          assert.equal(row.label.weight, '700')
          assert.equal(row.label.color, row.text, 'a click label is in the row text colour')
        }
      }
    })
  }
})
