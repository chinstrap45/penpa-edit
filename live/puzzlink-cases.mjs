import { readFileSync } from 'node:fs'

const PARSER = new URL('../test/public/puzz_link_parser.js', import.meta.url)
export const SNAPSHOTS = new URL('../test/snapshots/', import.meta.url)

export const cases = [...readFileSync(PARSER, 'utf8').matchAll(/^\s+\["([^"]+)", "([^"]+)"\],?$/mg)]
  .map(([, name, url]) => ({ name, url }))

// Upstream's filename rule, from `puzz_link_parser.js`.
export const snapshotName = (name) => `puzzlink_${name.toLowerCase().replace(/[^\w]/g, '_')}.json`

export const readSnapshot = (name) => JSON.parse(readFileSync(new URL(snapshotName(name), SNAPSHOTS), 'utf8'))
