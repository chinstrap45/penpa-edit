// withPenpaMark puts the mark where penpaLinkParams reads the parameters, and withoutPenpaMark takes it off again (#463).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/solve_forward.js', import.meta.url), 'utf8')
const forward = vm.runInNewContext(`${source}; ({ withPenpaMark, withoutPenpaMark, penpaLinkParams })`, { URLSearchParams })
const marked = (data) => forward.penpaLinkParams(data).get('ui') === 'penpa'

const LINKS = {
  'a query with `p=`': '?m=solve&p=abc',
  'a query with `p=` and `#` data': '?m=solve&p=abc#m=edit',
  'only `#` data': '#m=solve&p=abc',
  'a query without `p=` and solve `#` data': '?fbclid=1#m=solve&p=abc'
}

describe('the Penpa+ mark', () => {
  for (const [name, link] of Object.entries(LINKS)) {
    it(`is found where it was put, and taken off again, on ${name}`, () => {
      assert.equal(marked(link), false)
      const withMark = forward.withPenpaMark(link)
      assert.equal(marked(withMark), true, withMark)
      assert.equal(forward.withoutPenpaMark(withMark), link)
    })
  }
})
