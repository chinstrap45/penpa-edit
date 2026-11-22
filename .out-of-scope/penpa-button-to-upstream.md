# Penpa+ button opening swaroopg92's Penpa+

The solve page's Penpa+ button opens the fork's own `index.html`, never swaroopg92's Penpa+ on swaroopg92.github.io.

## Why this is out of scope

The button's job is an escape hatch to Penpa+'s page on the same puzzle with the solver's progress, and the round trip back
through the ChinStrap button (#364). Both rely on the progress store the two pages share in this origin's browser storage.
swaroopg92.github.io is another origin with its own storage, so the progress would have to ride in the link itself: long
links, and a page with no way back to `solve.html`. The redirect userscript also sends swaroopg92 links back to the fork, so
the button would need it to skip them, or the solver lands on the fork anyway.

The fork is splitting from upstream (AGENTS.md), and the fork's `index.html` already is Penpa+ with upstream's engine merged
nightly, so opening upstream's copy gains nothing the solver needs. Dropped by Chris, 2026-11-22, after tabling it 2026-11-17.

## Prior requests

- #248 — "Penpa+ button: open swaroopg92's Penpa+ with the progress in the link"
