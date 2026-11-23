// Settings ends with where to send questions and bugs, and where to read about the Redirect script (#380).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SCRIPT_ENTRY_URL } from '../test/redirect-urls.mjs'
import { AKARI_SOLVE, openSolvePage, useBrowser } from './page.mjs'

const browser = useBrowser()

const DISCORD_URL = 'https://discord.com/users/184770560356646923'

describe('the footer of Settings', () => {
  it('names @ChinStrap on Discord and links the Redirect script, each in a new tab that leaves the page as it was', async () => {
    const { context, page } = await openSolvePage(browser(), AKARI_SOLVE, { served: true })
    try {
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('dialog', { name: 'Settings' }).waitFor()
      const dialog = page.locator('wa-dialog[open]')
      const footer = dialog.locator('.ui-settings-footer')
      assert.match(await footer.textContent(), /Questions, bugs or suggestions\? Message me on Discord: @ChinStrap/)
      const links = await footer.getByRole('link').evaluateAll((nodes) => nodes.map((n) => [n.href, n.target, n.rel]))
      assert.deepEqual(links, [[DISCORD_URL, '_blank', 'noopener noreferrer'], [SCRIPT_ENTRY_URL, '_blank', 'noopener noreferrer']])

      const cardBoxes = () => page.evaluate(() => [...document.querySelectorAll('.ui-card')].map((card) => {
        const { left, top, width, height } = card.getBoundingClientRect()
        return [card.id || card.getAttribute('aria-label'), left, top, width, height]
      }))
      const before = await cardBoxes()
      for (const name of ['@ChinStrap', 'the Redirect script']) {
        const opened = context.waitForEvent('page')
        await footer.getByRole('link', { name, exact: true }).click()
        const tab = await opened
        await tab.close()
      }
      assert.equal(await dialog.count(), 1, 'Settings is still open')
      assert.deepEqual(await cardBoxes(), before, 'no card moved or resized')
    } finally {
      await context.close()
    }
  })
})
