# Nightly UI corpus failure of 2026-11-17 (#324)

Run 44108480432 (master at `f0046ffa`) failed with 32 failure lines, about 16 recordings, on `solve.html`.
Read from the run's log on 2026-11-21; no suite was run.

- One line, `genre-tool/combi-edgex now agrees on solve.html: remove its SOLVE_TODO entry`, is a stale `todo` mark for #138
  (a drag half a pixel off a point had no whole-pixel twin on `solve.html`).
- The rest (`genre/fillmat`, `hitori`, `hebi-ichigo`, `tentaisho`, `ripple`, `sukoro`, `slitherlink`, `yin-yang`, ...) differ at
  step 14, an `up` after a drag at the same point family: the same #138 gap.
- #339 (2026-11-18) made the driver aim at a pixel inside the canvas and dropped the stale marks. The runs of 18, 19, 20 and
  21 November were green, and `SOLVE_TODO` is empty.

Nothing to ticket and no expected file to update: the differences were #138's, fixed by #339.
