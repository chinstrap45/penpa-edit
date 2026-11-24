// caneff: saves a solve's progress after each change, edit or tool, because Penpa+'s own save as the page unloads is not awaited.

// Resolves false, writing nothing, when Penpa+ would not save it. PenpaProgress.save does not wait for its write, so this
// repeats its conditions and its stored text (the duplicate link with `&l=solvedup`) and awaits the write itself.
// MVP gap: a second copy of PenpaProgress.save's conditions, until the engine API owns saving.
async function saveProgressNow () {
  if (!pu.url || !UserSettings.save_current_puzzle || pu.mmode !== 'solve' || pu.replay ||
        !(await PenpaProgress.canSaveProgress())) {
    return false
  }
  await localforage.setItem(PenpaProgress.getHash(pu.url), pu.maketext_duplicate() + '&l=solvedup')
  return true
}

// MVP gap: patches Puzzle's methods until the engine API reports changes. Puzzle.record logs every edit; undo and redo move the log without calling it,
// and reset_board (Restart) clears it without calling it either.
// The tool and its orientation are part of the saved text, and a reload restores them only from a save made after they changed. The save waits one
// task so the change's own call has finished, and several changes in that task make one save.
const AUTOSAVE_TRIGGERS = ['record', 'undo', 'redo', 'reset_board', ...TOOL_CALLS]
function startProgressAutosave () {
  let saveQueued = false
  const saveSoon = () => {
    if (saveQueued) {
      return
    }
    saveQueued = true
    setTimeout(async () => {
      saveQueued = false
      try {
        await saveProgressNow()
      } catch (err) {
        console.error('progress autosave: could not save to local storage:', err)
      }
    }, 0)
  }
  for (const name of AUTOSAVE_TRIGGERS) {
    const original = Puzzle.prototype[name]
    Puzzle.prototype[name] = function (...args) {
      const result = original.apply(this, args)
      saveSoon()
      return result
    }
  }
}

startProgressAutosave()
