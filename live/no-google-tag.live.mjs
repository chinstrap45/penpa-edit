import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

const GOOGLE_TAG_HOST = /(^|\.)(googletagmanager|google-analytics)\.com$/

async function hostsRequestedBy (options) {
  const hosts = []
  const { page } = await openPenpa(browser(), '', {
    served: true,
    ...options,
    setup: (context) => context.on('request', (request) => hosts.push(new URL(request.url()).hostname))
  })
  // A tag script appended during load has been requested by the time the page's own load event has passed.
  await page.waitForLoadState('load')
  return hosts
}

describe('Google tag hosts', () => {
  for (const [name, options] of [['index.html', {}], ['solve.html', { solve: true, ready: () => typeof engine !== 'undefined' }]]) {
    it(`${name} requests none`, async () => {
      const hosts = await hostsRequestedBy(options)
      assert.ok(hosts.length > 0, 'the recorder saw the page load')
      assert.deepEqual(hosts.filter((host) => GOOGLE_TAG_HOST.test(host)), [])
    })
  }
})
