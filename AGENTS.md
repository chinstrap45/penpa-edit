# penpa-edit (caneff's fork of Penpa+)

Chris's fork of Penpa+ (`swaroopg92/penpa-edit`), served by GitHub Pages from `master:/docs` at `https://chinstrap45.github.io/penpa-edit/`.
The fork is splitting from upstream (Chris, 2026-11-09): upstream's engine files (parsers, grid classes, checkers) keep
being merged; the UI becomes ours, rebuilt against an engine API; `docs/js/class_p.js` is split step by step into the two.
The plan is the `/wayfinder` map on the tracker. A Tampermonkey script, `userscript/penpa-redirect.user.js`, sends every
`swaroopg92.github.io/penpa-edit/` link to the fork with its query and `#` data unchanged, so shared puzzle links open here (Chris,
2026-11-09). It is released with the Shared MVP (Chris, 2026-11-22); ChinStrap is Chris's setter name, and the page's identity
only stops naming Swaroop or upstream as its owner, with no self-promotion (Chris, 2026-11-22). Penpa+'s MIT copyright lines stay.

- **Read `docs/agents.md` first**: upstream's architecture overview and its four rules for AI agents (minimal modifications, readability, no
  guessing, document new code). Rules 1-3 hold here; rule 4 yields to `CODING_STANDARDS.md` rule 6 (a description stays where it
  adds a fact). A worker meets rule 3's "ask" by stopping and reporting to its controller (Chris, 2026-11-24).
- **Upstream**: the `upstream` remote is `swaroopg92/penpa-edit`, branch `master`. Its changes are merged into our `master`, never rebased.
  A file we own is marked `merge=ours` in `.gitattributes`, so a merge keeps our side and upstream's change to it is ported by hand
  or dropped (git has no built-in `ours` driver: only `upstream-merge.sh` passes one, with `git -c`; never write it to a config); every other upstream file follows `CODING_STANDARDS.md` § Upstream merges. Nothing ever goes back to upstream: no commit,
  push or PR (Chris, 2026-11-13). `gh repo set-default` names `chinstrap45/penpa-edit`, so `gh pr create` targets the fork.
- **Share links point at the fork** (Chris, 2026-11-09). `maketext_baseurl()` in `docs/js/class_p.js` already builds links from
  `location.href`; its localhost / `file://` branch names the fork's address too.
- **Our files**, outside upstream's: `.gitattributes` is the record, one `merge=ours` line per owned file or directory, and the lint and
  `test/upstream-merge.test.mjs` read it. Every owned file not named below is only such a line. The ones that need prose:
  `.agents/` holds the skills' tracker, label and domain docs (upstream already has a `docs/agents.md`, so ours cannot be `docs/agents/`);
  `research/` holds notes read from Penpa+'s source, outside `docs/` so Pages does not serve them; `docs/identity.js` holds the popup titles
  and the name the pages speak in; `docs/js/tool_calls.js` is the Puzzle calls that change the tool, one list for the bridge, the autosave and
  the recorder (#422); `docs/solve.html` is built from `index.html` plus the solve UI by `node live/build-solve.mjs`, never edited by hand
  (the nightly upstream merge runs it, and the script's header says how, #431); `docs/gallery.html`, `docs/gallery.js` and
  `docs/gallery-puzzles.js` are the review page (#256: representative puzzles opened in `solve.html` at set sizes), `gallery-puzzles.js`
  written by `node live/generate-gallery.mjs` from `live/gallery-puzzles.mjs`, which a live test checks it matches; `docs/ui/` is the solve
  UI, Web Awesome's bundle vendored in it; `docs/js/chinstrap_button.js` is index.html's ChinStrap button back to `solve.html` (#364);
  `docs/js/solve_forward.js` forwards a desktop solve link from index.html to `solve.html`, and the mark the Penpa+ button adds so it does
  not (#376); `docs/js/puzzlink_import.js` wraps puzzlink's decode so a failed import keeps the board (#18).
- **`GLOSSARY.md`**: the vocabulary.
- **Phones and tablets**: no change of ours is checked, styled or demonstrated at a phone or tablet size, and no ticket asks for it.
  Upstream's own phone support is left as it is. The one exception is routing: a phone-sized screen is checked to stay on
  `index.html` rather than forward to `solve.html` (`live/solve-forward.live.mjs`, spec #373).

## Agent skills

- **Dispatch cap**: a controller has at most 6 workers out at once, and at most 2 whose tickets change the same file under `docs/js/`.

### Issue tracker

GitHub issues at `chinstrap45/penpa-edit`, through `gh`. See `.agents/issue-tracker.md`.

### Triage labels

The six default roles, each label string equal to its role: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `backlog`, `wontfix`. See `.agents/triage-labels.md`.

### Domain docs

Single-context: a root `GLOSSARY.md` and upstream's `docs/agents.md`, plus a root `adr/` (outside `docs/`, so Pages does not serve it). See `.agents/domain.md`.

## Coding standards

Before you write or review code: read `CODING_STANDARDS.md`.

## End-to-end seam

- **Seam**: `npm run lint && npm test && npm run test:live:changed`. `npm run lint` (`live/lint.mjs`, #396) runs StandardJS and shellcheck
  over the `merge=ours` files, its scope read from git; before you change it, read its header. `npm test` runs the Node checks under
  `test/` and, once in headless Chromium (Playwright) over `file://`, upstream's puzz.link import snapshots (`test/snapshots.test.mjs`);
  a missing or changed snapshot, or a snapshot file with no puzzle in the list, fails it, and nothing writes one.
  `npm run test:live` is every `live/**/*.live.mjs` file (`node:test` + Playwright); `npm run test:live:changed` runs the ones the change
  since `origin/master`'s merge base needs. The selection is `live/run-live.mjs`'s, and its header says how. Three rules of it:
  a change to an input of the engine side runs the full set; any other change off the skip list runs every live file but the engine
  side's; a change made only of skip-list paths runs every live file but the safety net's. No change, or a detection that fails, runs
  the full set, and it prints which set it chose and why. In both commands, a page error or `console.error` on a page `openPenpa` or
  `openReloader` opened fails the test it happened in (`useBrowser`), the network is stubbed, and waits use `settle`, never a sleep.
  Both cap node at `--test-concurrency=4` (`live/run-live.mjs` holds the live files' flags), so at most 4 test files run at once on
  the shared box.
- **Narrowed**: `node live/run-narrowed.mjs --changed origin/master`: `npm run lint`, `npm test`, then the live files CI's `live` job would run for
  the change since that ref (`live/run-live.mjs`'s rule above); `--list` prints one suite per line. A detection that fails runs the full set and says why (#316).
- **CI**: `.github/workflows/ci.yml` runs `npm run lint` and `npm test` (job `unit`) and the live files spread over four runners (job `live`,
  `node live/run-live.mjs --part <k>/<n>`) on every PR and push to `master`, behind job `test`, which fails unless both
  passed; a PR runs the live files its change needs, by the rule above, and a push the full set. It also runs the
  expected-file gate on every PR (job `expected-files`, below). `.github/workflows/nightly.yml` runs CI's jobs on
  `master` every night with the full set and files one issue on a failure, or comments on the open one (#268). `.github/workflows/ui-corpus.yml` replays every recording on the UI driver
  nightly, a recording that still differs marked `todo` with its ticket (#80). A red night, or one that compared no recording, files one `bug` + `needs-info` issue titled `UI corpus failed` naming the differing recordings, or comments on the open one; a green night comments on it; the nightly seam files the same issue when the corpus's last scheduled run is over 36 hours old (#324). `.github/workflows/ui-fuzz-nightly.yml` runs `npm run fuzz:ui:nightly` (`live/ui-fuzz/nightly.mjs`) for 30 minutes on a fresh seed each night, and files one `bug` + `needs-info` issue per new failure title or comments on the open one (#234); its manual dispatch has a `dry_run` input that prints the issues instead. `.github/workflows/upstream-merge.yml` merges upstream nightly and pushes
  only when both pass on the merged tree and it changes no expected file; it also files one `needs-triage` issue per upstream
  commit that touched an owned file (Chris, 2026-11-14). `.github/scripts/require-checks.sh` makes both
  jobs required on `master` and strict (#221: a PR must contain the current master, else GitHub reports it BEHIND), with the admin role able to bypass; the nightly posts their statuses on the commit it
  tested before it pushes.
- **Expected-file changes** (#33): a ticket whose fix changes a recording's expected file lists each recording before the
  fix, under a `## Expected changes` heading, one bullet per id: a backticked id, a colon, the change in words. The
  controller approves only those ids, with the approve command (`npm run recordings:approve -- <id> ...`, no "update
  all"), which prints each file's change in plain words before it writes; every other change, and every change an
  upstream merge brings, goes to Chris. CI's `expected-files` job fails a PR that changes an expected file no ticket it
  closes listed before the fix started (the earliest author date of the PR's commits), passes a new recording, and posts
  each change in plain words as a PR comment. A ticket edit starts no run: re-run the job after one. Workers in
  `.claude/worktrees/` are denied writes to `live/recordings/**` and the approve command
  (`.claude/hooks/deny-recording-writes.mjs`).
- **Blind to**: phones and tablets, and anything `TESTING.md`'s links exercise that no test opens. Upstream's in-browser
  Mocha page stays as `npm run test:browser`; it is not part of the seam. Nor is `npm run measure` (`live/measure.mjs`,
  #32), which replays the whole corpus with JS coverage on and hunts every plant. It is run by hand, and nothing
  enforces when; its last tables are in `research/safety-net-measure-2026-11.md`. Nor is `npm run fuzz:ui -- [--seed <n>] [--minutes <m>]
  [--puzzle <name>] [--max-steps <n>] [--path <printed path>] [--focus <area> ...]` (`live/ui-fuzz/run.mjs`, #195): random fast-check action
  lists on `solve.html`, 2 minutes by default, `--focus` drawing one area's actions more often, a crash or broken rule shrunk and printed
  with the command that replays it (naming its puzzle), and a run that checked no list printed as "gave no verdict" with exit 1.
- **Playwright** is an approved dev dependency (Chris, 2026-11-09).
- **fast-check** is an approved dev dependency, for the solve.html UI fuzz (#195) (Chris, 2026-11-16).
- **standard** is an approved dev dependency, for the lint (#396) (Chris, 2026-11-23). **shellcheck** is the system's, on PATH
  (`sudo apt-get install shellcheck`; GitHub's ubuntu runners ship it): a tool a check needs is installed, never downloaded
  while the check runs (Chris, 2026-11-24, #416).
- **axe-core** is an approved dev dependency, for the solve page's WCAG AA contrast check (Chris, 2026-11-22).
- **CI runs on GitHub Actions here**, an exception to the local-CI rule: the repo is public, so Actions minutes are free, and
  the nightly upstream merge (#3) must run unattended (Chris, 2026-11-09).
- **The test plan** is `research/fork-audit-2026-11.md` § Test plan: each audit bug gets a red test, marked `todo` with its
  ticket until the fix lands.
