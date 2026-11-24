import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { openPenpa, useBrowser } from './page.mjs'

const browser = useBrowser()

// `console.error` is swallowed here so `useBrowser` does not fail the test on what redraw logs.
function redrawInPage ({ tags, value, breakCheck }) {
  document.getElementById('nb_size1').value = 4
  document.getElementById('nb_size2').value = 4
  create_newboard()
  pu.user_tags = tags
  for (const x of [0, 1]) pu.pu_q.number[pu.conflicts.xy_to_index(x, 0)] = [value, 1, '1']
  pu.solution = '[]' // `check_solution` runs the conflict check only on a puzzle with a stored answer
  pu.conflicts.reset()
  if (breakCheck) pu.check_solution = () => { throw new Error('check failed') }

  let draws = 0
  const draw = pu.draw
  pu.draw = function () { draws++; return draw.apply(this, arguments) }
  const logged = []
  const consoleError = console.error
  console.error = (...args) => logged.push(args.map(String).join(' '))
  try {
    pu.redraw()
  } finally {
    console.error = consoleError
  }
  const { data } = pu.ctx.getImageData(0, 0, pu.canvas.width, pu.canvas.height)
  let inked = 0
  for (let i = 0; i < data.length; i += 4) if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) inked++
  return { draws, logged, inked, conflicts: pu.conflict_cells.map((i) => pu.conflicts.index_to_xy(i)) }
}

describe('redraw', () => {
  let opened
  before(async () => { opened = await openPenpa(browser()) })
  after(async () => { await opened?.context.close() })
  const redraw = (args) => opened.page.evaluate(redrawInPage, args)

  it('keeps the board drawn when a digit is typed in an alphabet sudoku', async () => {
    const { draws, logged, inked, conflicts } = await redraw({ tags: ['alphabet', 'classic'], value: '1' })
    assert.deepEqual(logged, [])
    assert.deepEqual(conflicts, [[0, 0], [1, 0]])
    assert.notEqual(draws, 0, 'pu.draw ran')
    assert.ok(inked > 0, 'the board has non-white pixels')
  })

  it('draws the board once per redraw on a puzzle with a stored answer', async () => {
    const { draws, conflicts } = await redraw({ tags: ['classic'], value: '1' })
    assert.equal(draws, 1)
    assert.deepEqual(conflicts, [[0, 0], [1, 0]])
  })

  it('keeps the board drawn, and logs the error, when the answer check throws', async () => {
    const { draws, logged, inked } = await redraw({ tags: ['classic'], value: '1', breakCheck: true })
    assert.equal(logged.length, 1)
    assert.match(logged[0], /check failed/)
    assert.notEqual(draws, 0, 'pu.draw ran')
    assert.ok(inked > 0, 'the board has non-white pixels')
  })
})
