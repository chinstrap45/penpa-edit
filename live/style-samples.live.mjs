// Every style the bridge lists draws a sample in the tool cards (#429), not the text fallback that `styleSample` in
// `docs/ui/tool-cards.js` gives a name it does not know (the name as text, or `#n` for an unnamed style). A style renamed in the
// bridge without its sample would otherwise lose its picture with no error. The solve page is read through `engine.listTools()` and
// the Mode card's style buttons.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { settle } from './settle.mjs'
import { newBoardSolveLink, openSolvePage, setTool, useBrowser, waitForTool } from './page.mjs'

const browser = useBrowser()

// Runs in the page: the style buttons of the Mode card that drew the fallback, which is one `<text>` holding the name and nothing else.
function fallbackSamplesInPage () {
  return [...document.querySelectorAll('section[aria-label="Mode"] [role=group][aria-label="Style"] .ui-stylebtn')].map((button) => {
    const svg = button.querySelector('svg')
    const name = button.getAttribute('aria-label')
    const [only, ...rest] = svg.children
    return { name, fallback: rest.length === 0 && only?.tagName === 'text' && only.textContent === name.replace(/^style /, '#') }
  })
}

describe('the tool cards draw a sample for every style', () => {
  let opened
  before(async () => { opened = await openSolvePage(browser(), await newBoardSolveLink(browser())) })
  after(async () => { await opened?.context.close() })

  it('draws no fallback sample for any style name the bridge lists', async () => {
    const { page } = opened
    const tools = await page.evaluate(() => engine.listTools().filter((t) => t.styles.length).map((t) => ({
      mode: t.mode, submode: t.submode, names: t.styles.map((s) => s.name)
    })))
    // Tools sharing one list of style names show the same samples, so one of each list is opened.
    const bySet = new Map()
    for (const tool of tools) bySet.set(tool.names.join('|'), tool)
    const styleNames = new Set(tools.flatMap((t) => t.names))
    assert.ok(styleNames.size > 30, `${styleNames.size} style names listed`)

    const seen = new Set()
    const fallbacks = []
    for (const { mode, submode, names } of bySet.values()) {
      await setTool(page, { mode, submode })
      await waitForTool(page, { mode, submode })
      // The card redraws a frame after the tool changes.
      await settle(async () => (await page.evaluate(fallbackSamplesInPage)).map((d) => d.name), names)
      const samples = await page.evaluate(fallbackSamplesInPage)
      assert.deepEqual(samples.map((s) => s.name), names, `${mode} ${submode}: the card draws a button for each style`)
      for (const s of samples) {
        seen.add(s.name)
        if (s.fallback) fallbacks.push(`${mode} ${submode}: ${s.name}`)
      }
    }
    assert.deepEqual([...seen].sort(), [...styleNames].sort(), 'every listed style name was drawn')
    assert.deepEqual(fallbacks, [], 'a style with no sample of its own')
  })
})
