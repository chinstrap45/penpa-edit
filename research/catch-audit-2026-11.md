# Every `catch` in our JS against the fail-loud rule (2026-11-24)

Spec #443 (#449) read every `catch` in the `merge=ours` JS against `CODING_STANDARDS.md` rule 2 (a failure is never turned
into a "no" or an empty answer), since the audit's error-handling pass read only Python. Web Awesome's vendored bundle is
not ours to change and was not read. Line numbers are as of the commit that adds this note.

## Fixed

- `.claude/hooks/deny-npm-ci-symlink.mjs` `mayBeSymlink`: an unreadable `node_modules` (any error but ENOENT or
  ENOTDIR) was read as "no link", so `npm ci` was allowed; it is now denied.
- `live/upstream-docs.mjs` `unpackUpstreamDocs`: any git failure was reported as a missing `upstream/master`; only
  git's exit 1 is that now, and any other failure is thrown as itself.

## Fine, with the reason

- `docs/js/engine_bridge.js` 308 (shows the error and rejects the boot); 851 (warns and returns `{}`: a stale id map
  loses only a link, commented); 867 (`console.error`).
- `docs/js/progress_autosave.js` 31: `console.error` with the cause.
- `docs/js/puzzlink_import.js` 28: restores the board, shows `puzzlink_import_failed` with the error, and returns
  false, which callers read as "the board was not replaced", not as success.
- `docs/ui/desk.js` 1137: a load failure is shown by `main.js`; other errors are rethrown (commented).
- `docs/ui/paste-link.js` 19: `new URL` throws only for text that is not a URL, and the UI says "not a Penpa+ link".
- `docs/ui/ui-kit.js` 108: warns with the cause and falls back to the default.
- `.claude/hooks/command-parser.mjs` 37 (`parseCall`): an unreadable call returns null, and both hooks deny on null.
- `live/` tests that assert a throw or return its message: `big-board`, `solve-page` 112 and 287, `tools` 267 and 474,
  `settings-dialog`, `change-size`, `reset-layout`, `fuzz.live` 134 (the replay's throw becomes `{ thrown }`, which
  the plant's own check asserts on).
- `live/desk.live.mjs` 163: `JSON.parse` of other storage keys.
- `live/` code that reports the failure as a named failed state or rethrows with context: `gallery.live` 38, `plants`
  273 and 328, `replay` 663 (tags the error `notLoaded` and rethrows) and 789, `generate-recordings` 153 (rethrows as
  `NoBoot`), 307 and 330, `measure` 72, `tier-c` 176, `fuzz` 225, `ui-fuzz/engine` 51, `ui-fuzz/run` 39,
  `ui-fuzz/nightly` 94, `lint` 82, `run-live` 151.
- `live/recordings.mjs` 42: ENOENT only; anything else is rethrown.
- `live/upstream-docs.mjs` 21: cleanup, then rethrows.
- `live/page.mjs` 134: filters one benign race and records the rest.
- `live/fuzz.mjs` 236 and `live/replay.mjs` 667: silence an unhandled rejection on a promise that is awaited later
  (commented).
- `live/ui-replay-part.mjs` 67: a `SOLVE_TODO` entry is a known-red todo, so any failure counts as the known difference;
  a recording that starts to agree still fails, on the `notEqual` assert.
- `test/upstream-docs.test.mjs` 17: prints the error's message for the test to assert on.
