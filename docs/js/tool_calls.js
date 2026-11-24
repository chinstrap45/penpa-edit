// caneff: the Puzzle calls that change the current tool, read by engine_bridge.js (change events), progress_autosave.js (saves) and
// recorder.js (steps), so a tool call added here reaches all three (#422). Loaded before them.
// `subsymbolmode` and `subcombimode` keep the Shape or Composite tool where other modes keep their sub-mode.
const TOOL_CALLS = ['mode_set', 'submode_check', 'stylemode_check', 'subsymbolmode', 'subcombimode', 'set_orientation']
