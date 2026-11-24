// caneff: the one list of tool-changing Puzzle calls for the bridge, the autosave and the recorder, so a call added here reaches all three.
// `subsymbolmode` and `subcombimode` keep the Shape or Composite tool where other modes keep their sub-mode.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts read
const TOOL_CALLS = ['mode_set', 'submode_check', 'stylemode_check', 'subsymbolmode', 'subcombimode', 'set_orientation']
