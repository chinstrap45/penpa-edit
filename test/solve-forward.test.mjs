// withPenpaMark puts the mark where penpaLinkParams reads the parameters, and withoutPenpaMark takes it off again (#463).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('../docs/js/solve_forward.js', import.meta.url), 'utf8')
const forward = vm.runInNewContext(`${source}; ({ PENPA_MARK, withPenpaMark, withoutPenpaMark, penpaLinkParams })`, { URLSearchParams })
const marked = (data) => forward.penpaLinkParams(data).get(forward.PENPA_MARK.split('=')[0]) === forward.PENPA_MARK.split('=')[1]

const LINKS = {
  'a query with `p=`': '?m=solve&p=abc',
  'a query with `p=` and `#` data': '?m=solve&p=abc#m=edit',
  'only `#` data': '#m=solve&p=abc',
  'a query without `p=` and solve `#` data': '?fbclid=1#m=solve&p=abc',
  'a query whose parameter only ends in `p`': '?xp=1#m=solve&p=abc'
}

describe('the Penpa+ mark', () => {
  for (const [name, link] of Object.entries(LINKS)) {
    it(`is found where it was put, and taken off again, on ${name}`, () => {
      assert.equal(forward.penpaLinkParams(link).get('m'), 'solve', 'the link reads as the solve it holds')
      assert.equal(marked(link), false)
      const withMark = forward.withPenpaMark(link)
      assert.equal(marked(withMark), true, withMark)
      assert.equal(forward.withoutPenpaMark(withMark), link)
    })
  }

  it('leaves a link with no parameters unmarked', () => {
    for (const link of ['?fbclid=1', '?fbclid=1#', '']) {
      assert.equal(forward.withPenpaMark(link), link)
    }
  })
})
