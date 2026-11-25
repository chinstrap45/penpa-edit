// caneff: the solve page's Penpa+ button marks its link with PENPA_MARK so the forward skips it. forwardSolveLink runs before
// anything else loads, so a forwarded page never paints.
const PENPA_MARK_KEY = 'ui'
const PENPA_MARK_VALUE = 'penpa'
const PENPA_MARK = `${PENPA_MARK_KEY}=${PENPA_MARK_VALUE}`

// A link's data split at its first `#`: the query with its `?`, and the `#` data with its `#` (empty when there is none).
function splitAtHash (data) {
  const hash = data.indexOf('#')
  return hash === -1 ? [data, ''] : [data.slice(0, hash), data.slice(hash)]
}

// A query with no `p=` (?fbclid=, ?utm_source=) is no link; boot() in general.js reads the `#` data then, and so does this.
const queryHoldsPuzzle = (query) => /(^|&)p=/.test(query.slice(1))

// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function penpaLinkParams (data) {
  const [query, hashData] = splitAtHash(data)
  return new URLSearchParams(queryHoldsPuzzle(query) ? query.slice(1) : hashData.slice(1))
}

const isMarkedForPenpa = (params) => params.get(PENPA_MARK_KEY) === PENPA_MARK_VALUE

// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function withPenpaMark (data) {
  const params = penpaLinkParams(data)
  // A link with no parameters is no solve link, so there is nothing to keep on this page.
  if (!params.size || isMarkedForPenpa(params)) {
    return data
  }
  // The mark goes where penpaLinkParams reads the parameters: the end of the query, or of the `#` data.
  const [query, hashData] = splitAtHash(data)
  if (queryHoldsPuzzle(query)) {
    return `${query}&${PENPA_MARK}${hashData}`
  }
  return `${query}${hashData}&${PENPA_MARK}`
}

// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function withoutPenpaMark (data) {
  return data.replace(new RegExp(`([?#&])${PENPA_MARK}(&|(?=#|$))`, 'g'), (whole, before, after) => (before === '&' ? after : before))
}

// location.replace, so Back does not return here.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function forwardSolveLink () {
  const data = location.search + location.hash
  const params = penpaLinkParams(data)
  if (params.get('m') !== 'solve' || isMarkedForPenpa(params)) {
    return
  }
  if (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) {
    return
  }
  location.replace(`solve.html${data}`)
}
