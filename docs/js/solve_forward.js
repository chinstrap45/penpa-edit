// caneff: index.html forwards a solve link to the ChinStrap solve page on a desktop-sized screen (#376, spec #373 § Forwarding).
// The solve page's Penpa+ button marks the link it opens with PENPA_MARK so the forward skips it, and index.html's ChinStrap
// button drops the mark again. Call forwardSolveLink before anything else loads, so a forwarded page never paints.

// The parameter that keeps a solve link on index.html.
const PENPA_MARK = 'ui=penpa';

// A link's parameters, from its query and its `#` data both: Penpa+ reads one or the other, and the Redirect script
// (userscript/penpa-redirect.user.js) calls a link a solve when either says `m=solve`.
function linkParts(data) {
    return data.split(/[?#&]/);
}

// `data` (a page's query and `#` data) with the mark added to the part last in it, unless it is there already. No data is
// no link, and stays none.
function withPenpaMark(data) {
    return !data || linkParts(data).includes(PENPA_MARK) ? data : `${data}&${PENPA_MARK}`;
}

// `data` with every mark taken out, and the `?` or `#` of a part the mark led kept.
function withoutPenpaMark(data) {
    return data.replace(new RegExp(`([?#&])${PENPA_MARK}(&|(?=#|$))`, 'g'), (whole, before, after) => (before === '&' ? after : before));
}

// Opens a solve link on solve.html in place of this page, so Back does not return here, unless the screen is phone-sized
// (a coarse pointer, or narrower than 768 px), the link is not a solve or the Penpa+ button marked it.
function forwardSolveLink() {
    const data = location.search + location.hash;
    const parts = linkParts(data);
    if (!parts.includes('m=solve') || parts.includes(PENPA_MARK)) {
        return;
    }
    if (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) {
        return;
    }
    location.replace(`solve.html${data}`);
}
