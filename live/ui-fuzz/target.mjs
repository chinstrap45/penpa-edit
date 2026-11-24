import { afterChange, openSolvePage } from '../page.mjs'
import { readPageState } from './page-state.mjs'

const ACTION_TIMEOUT_MS = 5000

export const openTarget = (browser, { setup, served } = {}) => async (puzzle) => {
  const { context, page, errors } = await openSolvePage(browser, puzzle.source, { setup, served })
  page.setDefaultTimeout(ACTION_TIMEOUT_MS)
  return {
    page,
    snapshot: () => readPageState(page, errors),
    drawn: () => afterChange(page),
    close: () => context.close()
  }
}
