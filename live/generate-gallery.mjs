import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { galleryEntries, renderGalleryFile } from './gallery-puzzles.mjs'

const browser = await chromium.launch()
try {
  await writeFile(new URL('../docs/gallery-puzzles.js', import.meta.url), renderGalleryFile(await galleryEntries(browser)))
} finally {
  await browser.close()
}
