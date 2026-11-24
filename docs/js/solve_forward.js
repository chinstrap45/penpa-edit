// caneff: the solve page's Penpa+ button marks its link with PENPA_MARK so the forward skips it. forwardSolveLink runs before
// anything else loads, so a forwarded page never paints.
const PENPA_MARK = 'ui=penpa'

// Read the way Penpa+ reads them: from the query, or from the `#` data when there is no query (Chris, 2026-11-24, #430).
// The forward below and index.html's ChinStrap button both decide what is a solve link from this, so they cannot disagree.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function penpaLinkParams (data) {
  const hash = data.indexOf('#')
  const query = hash === -1 ? data : data.slice(0, hash)
  return new URLSearchParams(query.startsWith('?') && query.length > 1 ? query.slice(1) : data.slice(hash + 1 || data.length))
}

// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function withPenpaMark (data) {
  if (!data || penpaLinkParams(data).get('ui') === 'penpa') {
    return data
  }
  // The mark goes where Penpa+ reads the parameters: the end of the query, when the link has one.
  const hash = data.indexOf('#')
  return data.startsWith('?') && data.length > 1 && hash !== -1 ? `${data.slice(0, hash)}&${PENPA_MARK}${data.slice(hash)}` : `${data}&${PENPA_MARK}`
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
  if (params.get('m') !== 'solve' || params.get('ui') === 'penpa') {
    return
  }
  if (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) {
    return
  }
  location.replace(`solve.html${data}`)
}
