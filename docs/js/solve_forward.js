// caneff: index.html forwards a solve link to the ChinStrap solve page on a desktop-sized screen (#376, spec #373 § Forwarding).
// The solve page's Penpa+ button marks the link it opens with PENPA_MARK so the forward skips it, and index.html's ChinStrap
// button drops the mark again. Call forwardSolveLink before anything else loads, so a forwarded page never paints.

// The parameter that keeps a solve link on index.html.
const PENPA_MARK = 'ui=penpa'

// A link's parameters, read the way Penpa+ reads them: from its query, or from its `#` data when it has no query (Chris,
// 2026-11-24, #430). `data` is a page's query and `#` data. The forward below and index.html's ChinStrap button both
// decide what is a solve link from this, so they cannot disagree.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function penpaLinkParams (data) {
  const hash = data.indexOf('#')
  const query = hash === -1 ? data : data.slice(0, hash)
  return new URLSearchParams(query.startsWith('?') && query.length > 1 ? query.slice(1) : data.slice(hash + 1 || data.length))
}

// `data` (a page's query and `#` data) with the mark added to the part last in it, unless it is there already. No data is
// no link, and stays none.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function withPenpaMark (data) {
  if (!data || penpaLinkParams(data).get('ui') === 'penpa') {
    return data
  }
  // The mark goes where Penpa+ reads the parameters: the end of the query, when the link has one.
  const hash = data.indexOf('#')
  return data.startsWith('?') && data.length > 1 && hash !== -1 ? `${data.slice(0, hash)}&${PENPA_MARK}${data.slice(hash)}` : `${data}&${PENPA_MARK}`
}

// `data` with every mark taken out, and the `?` or `#` of a part the mark led kept.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts call
function withoutPenpaMark (data) {
  return data.replace(new RegExp(`([?#&])${PENPA_MARK}(&|(?=#|$))`, 'g'), (whole, before, after) => (before === '&' ? after : before))
}

// Opens a solve link on solve.html in place of this page, so Back does not return here, unless the screen is phone-sized
// (a coarse pointer, or narrower than 768 px), the link is not a solve or the Penpa+ button marked it.
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
