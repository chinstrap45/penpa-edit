// caneff: the one list of the Puzzle calls that change the tool, so every reader that hooks them sees a call added here.
// `subsymbolmode` and `subcombimode` keep the Shape or Composite tool where other modes keep their sub-mode.
// eslint-disable-next-line no-unused-vars -- a global the page's scripts read
const TOOL_CALLS = ['mode_set', 'submode_check', 'stylemode_check', 'subsymbolmode', 'subcombimode', 'set_orientation']
