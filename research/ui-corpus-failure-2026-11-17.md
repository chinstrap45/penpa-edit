# Nightly UI corpus failure of 2026-11-17 (#324)

Run 44108480432 (master at `f0046ffa`) failed on `solve.html`: 16 recordings, 32 failure lines.
Read from the run's log on 2026-11-21; no suite was run.

- Five recordings failed only because their `SOLVE_TODO` mark was stale: `genre-tool/combi-edgex`, `genre-tool/combi-edgexoi`,
  `genre/scrin`, `genre/slitherlink` and `genre/vertex-slitherlink` now agreed with the engine driver ("remove its
  SOLVE_TODO entry", marked #138: a drag half a pixel off a point had no whole-pixel twin on `solve.html`).
- Ten differed at step 14, an `up` after a drag (`genre/fillmat`, `hitori`, `hebi-ichigo`, `tentaisho`, `ripple`, `sukoro`,
  `hashiwokakero`, `simplegako`, `statue-park`, `yin-yang`).
- `grid/uniform-special` differed at step 34, a Ctrl-click: the engine driver's polygon point 342 became 341 in the UI
  driver. Its replay is in `GENERATED_SAMPLE` for a midway point whose lower-index pixel the UI driver must step past.
- #339 (2026-11-18) made the driver aim at a pixel inside the canvas and dropped the stale marks, and the runs of 18, 19,
  20 and 21 November were green with `SOLVE_TODO` empty. That the 11 differing replays are #339's fix is inferred from
  that timing and #339's title, not from a replay of the old tree.

No new ticket and no expected file to update: nothing still differs.
