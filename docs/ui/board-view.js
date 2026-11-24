// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
  'use strict'

  const { el, storeFlag, visibleBox, clamp } = window.uiKit

  // Below this a card body is a layout in progress, not a box to fit the board to.
  const MIN_FIT_BOX_PX = 40
  const FIT_PASSES = 3
  // The board's container is 1 px wider than its canvas on every side, and it is the container that scrolls the card.
  const BOARD_FRAME_PX = 2
  const ZOOM_STEP_PX = 4
  // The key keeps its first name, so a setting made then holds.
  const COORDINATES_KEY = 'chinstrap-solve-grid-numbers-v1'
  const COORDINATES_SHOWN = '1'
  const GRID_NUMBERING_KEY = 'chinstrap-solve-number-grid-only-v1'
  const GRID_NUMBERING_ALL = 'all'

  // The Board card's body, which holds the board and scrolls it.
  let body = null

  // The cell size the board is drawn at; the - and + buttons step it from here.
  let cellPx = null
  // True from the solver's first - or + until Fit (or a layout reset) refits the board.
  let isZoomed = false
  // The Board card's - and + buttons, which are disabled at the cell-size limits.
  let zoomButtons = null
  // The cursor's cell as the last change saw it (read when the desk opens, so the starting cell is not a move), and
  // whether it has moved since (until it has, the cursor is Penpa+'s starting cell, not a place the solver chose).
  let cursorCell = null
  let hasCursorMoved = false

  // The Board card's box that holds the canvas, and the layer in it that carries the board coordinates (desk.css gives the
  // box the gutter they sit in, while `ui-coordinates-on` is set).
  let boardBox = null
  let coordinatesLayer = null

  const areCoordinatesWanted = () => localStorage.getItem(COORDINATES_KEY) === COORDINATES_SHOWN

  const isGridNumberedOnly = () => localStorage.getItem(GRID_NUMBERING_KEY) !== GRID_NUMBERING_ALL

  // The width of one gutter the coordinates sit in.
  const coordinatesGutter = () => (boardBox.classList.contains('ui-coordinates-on') ? parseFloat(getComputedStyle(boardBox).paddingLeft) : 0)
  // The room the coordinates take on one axis, which the fit leaves out: a gutter on each side when the grid alone is numbered
  // (it is labelled on all four sides then), else one.
  const coordinatesRoom = () => coordinatesGutter() * (isGridNumberedOnly() ? 2 : 1)

  // So a band is one to two cells wide whatever the grid's shape.
  const BAND_CELLS = 1.5
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  // A, B, ... Z, AA, AB, ...: a grid wider than 26 bands runs on as a spreadsheet's columns do.
  const bandName = (i) => (i < LETTERS.length ? '' : bandName(Math.floor(i / LETTERS.length) - 1)) + LETTERS[i % LETTERS.length]

  // 1, 2, 3... at each of `ats` (the labels of a numbered axis), and A, B, C... at each of `ats` (a band axis).
  const numbered = (ats) => ats.map((at, i) => ({ at, text: i + 1, band: false }))
  const lettered = (ats) => ats.map((at, i) => ({ at, text: bandName(i), band: true }))

  function bandMiddles (from, to, area) {
    const count = Math.round((to - from) / (BAND_CELLS * area.cellWidth))
    return Array.from({ length: count }, (_, i) => from + ((i + 0.5) * (to - from)) / count)
  }

  function bandLabels (area) {
    return {
      columns: lettered(bandMiddles(area.left, area.right, area)),
      rows: bandMiddles(area.top, area.bottom, area).map((at, j) => ({ at, text: j + 1, band: true }))
    }
  }

  function rowLabels (rows, area) {
    return { columns: lettered(bandMiddles(area.left, area.right, area)), rows: numbered(rows) }
  }

  // The labels of a square-cell grid: its own column and row numbers, on the centre lines of the cells.
  function numberLabels (axes) {
    return { columns: numbered(axes.columns), rows: numbered(axes.rows) }
  }

  // Puts one label per column and row in the gutter outside the canvas, outside any outside clue (a scrolled board slides them over its cells, see stickCoordinates): numbers on a square-cell grid, numbers down and letters across on a grid of horizontal rows, bands on any other.
  function drawCoordinates () {
    const wanted = areCoordinatesWanted()
    boardBox.classList.toggle('ui-coordinates-on', wanted)
    boardBox.classList.toggle('ui-coordinates-four-sides', wanted && isGridNumberedOnly())
    coordinatesLayer.replaceChildren()
    if (!wanted) {
      return
    }
    const axes = engine.getGridAxes({ framedOnly: isGridNumberedOnly() })
    const rows = axes ? null : engine.getGridRows()
    const labels = axes ? numberLabels(axes) : rows ? rowLabels(rows, engine.getGridArea()) : bandLabels(engine.getGridArea())
    const isNumbered = Boolean(axes || rows)
    const box = boardBox.getBoundingClientRect()
    const gutter = coordinatesGutter()
    const label = (axis, side, { text, band }, left, top) => el('span', {
      class: band ? 'ui-grid-coordinate ui-grid-band' : 'ui-grid-coordinate', 'data-axis': axis, 'data-side': side, style: `left:${left}px;top:${top}px`
    }, [String(text)])
    const sides = [['start', 0]]
    // The far sides repeat the labels of a grid that is numbered alone, on a square-cell grid or a grid of rows; the bands of any other grid are not repeated.
    if (isNumbered && isGridNumberedOnly()) {
      sides.push(['end', 1])
    }
    coordinatesLayer.append(
      ...sides.flatMap(([side, far]) => labels.columns.map((c) => label('column', side, c, c.at - box.left, gutter / 2 + far * (box.height - gutter)))),
      ...sides.flatMap(([side, far]) => labels.rows.map((r) => label('row', side, r, gutter / 2 + far * (box.width - gutter), r.at - box.top))))
    stickCoordinates()
  }

  // Slides the column labels down and the row labels right by how far the board has scrolled past the card's top and left
  // edges (desk.css reads the two variables), so they stay in view while the cells scroll under them.
  function stickCoordinates () {
    const view = visibleBox(boardBox.parentElement)
    const box = boardBox.getBoundingClientRect()
    coordinatesLayer.style.setProperty('--ui-stick-x', `${Math.max(0, view.left - box.left)}px`)
    coordinatesLayer.style.setProperty('--ui-stick-y', `${Math.max(0, view.top - box.top)}px`)
    // The far labels slide the other way, up and left, when the board's right and bottom edges are past the card's.
    coordinatesLayer.style.setProperty('--ui-stick-end-x', `${Math.min(0, view.right - box.right)}px`)
    coordinatesLayer.style.setProperty('--ui-stick-end-y', `${Math.min(0, view.bottom - box.bottom)}px`)
  }

  function storeAndRefit (key, value, on) {
    storeFlag(key, value, on)
    drawCoordinates()
    if (!isZoomed) {
      fitBoard()
    }
  }

  const setGridNumberedOnly = (only) => storeAndRefit(GRID_NUMBERING_KEY, GRID_NUMBERING_ALL, !only)
  const setCoordinatesWanted = (shown) => storeAndRefit(COORDINATES_KEY, COORDINATES_SHOWN, shown)

  // The box inside the body's padding (desk.css), which is the room the board has.
  function bodyRoom () {
    const style = getComputedStyle(body)
    return {
      w: body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      h: body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    }
  }

  function showZoomLimits () {
    const { min, max } = engine.CELL_SIZE_RANGE
    zoomButtons.out.disabled = cellPx <= min
    zoomButtons.in.disabled = cellPx >= max
  }

  // Redrawing the board can change the room it has (a scrollbar going, the layout settling), so the fit repeats until
  // the room it was made for is the room that is left, at most FIT_PASSES times.
  function fitBoard () {
    isZoomed = false
    drawCoordinates()
    for (let pass = 0; pass < FIT_PASSES; pass++) {
      const room = bodyRoom()
      const w = room.w - BOARD_FRAME_PX - coordinatesRoom()
      const h = room.h - BOARD_FRAME_PX - coordinatesRoom()
      if (w < MIN_FIT_BOX_PX || h < MIN_FIT_BOX_PX) {
        return
      }
      cellPx = engine.fitBoard(w, h)
      const after = bodyRoom()
      if (after.w === room.w && after.h === room.h) {
        break
      }
    }
    showZoomLimits()
    drawCoordinates()
  }

  // Scrolls the body so the cursor's cell is in view: only when it is not, or always (centred) with `centre`.
  function showCursor (centre) {
    const focus = engine.getFocusRect()
    if (!focus) {
      return
    }
    const visible = visibleBox(body)
    const isInside = focus.left >= visible.left && focus.right <= visible.right && focus.top >= visible.top && focus.bottom <= visible.bottom
    if (isInside && !centre) {
      return
    }
    body.scrollLeft += (focus.left + focus.right - visible.left - visible.right) / 2
    body.scrollTop += (focus.top + focus.bottom - visible.top - visible.bottom) / 2
  }

  // Follows the cursor when it moves to a cell the card does not show.
  function followCursor () {
    const focus = engine.getFocusRect()
    const cell = focus ? focus.cell : null
    if (cell === cursorCell) {
      return
    }
    cursorCell = cell
    hasCursorMoved = true
    showCursor(false)
  }

  function zoomBoardTo (px) {
    const { min, max } = engine.CELL_SIZE_RANGE
    cellPx = clamp(px, min, max)
    isZoomed = true
    engine.setCellSize(cellPx)
    showZoomLimits()
    drawCoordinates()
  }

  function zoomBoard (steps) {
    if (cellPx === null) {
      return
    }
    zoomBoardTo(cellPx + steps * ZOOM_STEP_PX)
    if (hasCursorMoved) {
      showCursor(true)
    }
  }

  // Puts the board in the Board card's `body` and lays the coordinates layer over it.
  function mount (boardBody) {
    body = boardBody
    engine.mount(body)
    boardBox = body.firstElementChild
    coordinatesLayer = el('div', { class: 'ui-grid-coordinates', 'aria-hidden': 'true' })
    boardBox.append(coordinatesLayer)
    boardBox.parentElement.addEventListener('scroll', stickCoordinates)
  }

  function watch (zoom, card) {
    zoomButtons = zoom
    zoom.out.addEventListener('click', () => zoomBoard(-1))
    zoom.in.addEventListener('click', () => zoomBoard(1))
    zoom.fit.addEventListener('click', fitBoard)
    cursorCell = engine.getFocusRect()?.cell ?? null
    engine.on('change', () => {
      followCursor()
      drawCoordinates()
    })
    // Fires once on observe, which is the first fit, and again whenever the card changes size: a refit, unless the solver
    // zoomed, which only Fit or a layout reset drops. The card is watched, not its body, since a scrollbar appearing
    // narrows the body and would undo the zoom at once.
    new ResizeObserver(() => {
      if (!isZoomed) {
        fitBoard()
      } else {
        drawCoordinates()
      }
    }).observe(card)
  }

  window.boardView = {
    mount,
    watch,
    fitBoard,
    bodyRoom,
    // The cell size of a board the solver zoomed, else null.
    zoomedCellPx: () => (isZoomed ? cellPx : null),
    zoomBoardTo,
    forgetZoom: () => { isZoomed = false },
    areCoordinatesWanted,
    setCoordinatesWanted,
    isGridNumberedOnly,
    setGridNumberedOnly
  }
})()
