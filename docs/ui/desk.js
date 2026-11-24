// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
  'use strict'

  const { el, addTooltip, readStored, storeFlag, clamp } = window.uiKit
  const { boardView } = window

  const CARD_GAP_PX = 10
  const DESK_MARGIN_PX = 14
  const COLUMN_WIDTH_PX = 380
  const MIN_COLUMN_WIDTH_PX = 240
  const MIN_BOARD_WIDTH_PX = 300
  const TOP_MARGIN_PX = 12
  const LEFT_WIDTH_STEP_PX = 8
  const EDGE_MARGIN_PX = 8
  const LAYOUT_KEY = 'chinstrap-solve-layout-v1'
  const DRAG_THRESHOLD_PX = 4
  const REFIT_DELAY_MS = 150
  // The most of the left column Rules keeps when Mouse needs the room (Chris, 2026-11-17).
  const RULES_SHARE = 0.55
  const SIDE_COLUMN_MAX_PX = 640
  // A wide but short desk has no height for bigger text, so the tighter of width and height sets the scale.
  const TEXT_SCALE_FROM = { w: 1600, h: 900 }
  const TEXT_SCALE_MAX = 1.5
  const HEADING_GAP_PX = 12
  const MIN_SIZE = { board: [240, 200], mouse: [260, 140], pins: [240, 110], mode: [280, 170], recent: [240, 56], rules: [200, 80] }
  const RULES_TEXT_KEY = 'chinstrap-solve-rules-text-v1'
  const RULES_TEXT_RANGE_PX = { min: 10, max: 20, step: 2 }
  // Each card is kept closed in its own key, apart from the layout, so Reset layout leaves it closed.
  const CLOSEABLE_CARDS = ['rules', 'mouse', 'pins', 'mode', 'recent']
  const closedKey = (id) => `chinstrap-solve-${id}-closed-v1`
  const CARD_CLOSED = '1'
  const FIT_TOOLTIP = 'Double-click to fit automatically'
  // desk.css places and styles each handle by the same name.
  const RESIZE_HANDLES = {
    top: ['top'],
    right: ['right'],
    bottom: ['bottom'],
    left: ['left'],
    'top-left': ['top', 'left'],
    'top-right': ['top', 'right'],
    'bottom-right': ['bottom', 'right'],
    'bottom-left': ['bottom', 'left']
  }

  const LEFT_COLUMN = ['rules', 'mouse']
  const RIGHT_COLUMN = ['pins', 'mode', 'recent']
  const CARD_TITLES = { board: 'Board', mouse: 'Mouse', rules: 'Rules', pins: 'Pinned', mode: 'Mode', recent: 'Recent' }

  const RULES_MARKER = /^(\s*(?:[-\u2022*]|\d{1,2}[.)])\s+)([\s\S]*)$/
  const RULES_URL = /https?:\/\/[^\s<>"]+/g
  const URL_TRAILING = /[.,;:!?\]'"]+$/
  const countOf = (text, char) => text.split(char).length - 1

  function trimUrl (url) {
    let trimmed = url
    for (let previous = ''; previous !== trimmed;) {
      previous = trimmed
      trimmed = trimmed.replace(URL_TRAILING, '')
      if (trimmed.endsWith(')') && countOf(trimmed, ')') > countOf(trimmed, '(')) {
        trimmed = trimmed.slice(0, -1)
      }
    }
    return trimmed
  }

  // Every node is made with textContent and setAttribute, so the rules never become HTML.
  function appendWithLinks (parent, text) {
    let last = 0
    for (const match of text.matchAll(RULES_URL)) {
      const url = trimUrl(match[0])
      parent.append(text.slice(last, match.index))
      const link = el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' })
      link.textContent = url
      parent.append(link)
      last = match.index + url.length
    }
    parent.append(text.slice(last))
  }

  const isRulesEmpty = (rulesCard) => rulesCard.querySelector('.ui-body').classList.contains('ui-rules-empty')

  // A card's height is kept when the solver sized it, except the Rules card of a link with no rules: its one-line height
  // belongs to that link, and the layout is shared by every puzzle.
  const isEmptyRulesCard = (id, node) => id === 'rules' && isRulesEmpty(node)
  const keepsHeight = (id, node) => node.classList.contains('is-sized') && !isEmptyRulesCard(id, node)

  function showRules (body, rules) {
    const isEmpty = !rules?.trim()
    body.classList.toggle('ui-rules-empty', isEmpty)
    if (isEmpty) {
      body.textContent = 'No rules in this link.'
      return
    }
    body.replaceChildren(...rules.split('\n').map((text) => {
      const line = el('div', { class: 'ui-rules-line' })
      const [, marker, rest] = text.match(RULES_MARKER) || []
      if (marker === undefined) {
        appendWithLinks(line, text)
      } else {
        line.classList.add('ui-rules-item')
        const markerNode = el('span', { class: 'ui-rules-marker' })
        markerNode.textContent = marker
        const textNode = el('span', { class: 'ui-rules-item-text' })
        appendWithLinks(textNode, rest)
        line.append(markerNode, textNode)
      }
      return line
    }))
  }

  function build (info) {
    const bar = el('header', { class: 'ui-bar' }, [
      el('div', { class: 'ui-heading' }, [
        el('h1', { class: 'ui-title' }, [info.title || 'Untitled']),
        el('span', { class: 'ui-author' }, [info.author ? `by ${info.author}` : ''])
      ]),
      el('span', { class: 'ui-spacer' })
    ])
    const desk = el('div', { class: 'ui-desk' })
    const cards = {}
    Object.entries(CARD_TITLES).forEach(([id, title]) => {
      const body = el('div', { class: 'ui-body' })
      const head = el('div', { class: 'ui-head' }, [el('h2', {}, [title])])
      // A native tooltip: a Web Awesome one on each of the 48 handles slowed every tool change, since each is laid out
      // again with the page.
      const handles = Object.keys(RESIZE_HANDLES).map((name) =>
        el('div', { class: `ui-resize ui-resize-${name}`, 'data-testid': `resize-${name}`, title: FIT_TOOLTIP }))
      cards[id] = {
        body,
        head,
        handles,
        node: el('section', { class: `ui-card ui-card-${id}`, 'aria-label': title }, [head, body, ...handles])
      }
      desk.append(cards[id].node)
    })
    const headButton = (content, label, hoverLabel = label) => {
      const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' },
        label ? [el('span', { 'aria-hidden': 'true' }, [content]), el('span', { class: 'ui-sr-only' }, [label])] : [content])
      addTooltip(node, hoverLabel)
      return node
    }
    const zoom = {
      out: headButton('\u2212', 'Zoom out'),
      in: headButton('+', 'Zoom in'),
      fit: headButton('Fit', null, 'Fit board')
    }
    cards.board.head.append(el('span', { class: 'ui-zoom' }, [zoom.out, zoom.in, zoom.fit]))
    const rulesText = { smaller: headButton('\u2212', 'Smaller rules text'), bigger: headButton('+', 'Bigger rules text') }
    const closeButtons = Object.fromEntries(CLOSEABLE_CARDS.map((id) => {
      const button = headButton('\u00d7', `Close ${CARD_TITLES[id]} card`)
      button.classList.add('ui-close')
      cards[id].head.append(button)
      return [id, button]
    }))
    cards.rules.head.append(el('span', { class: 'ui-rules-text' }, [rulesText.smaller, rulesText.bigger]))
    showRules(cards.rules.body, info.rules)
    const root = el('div', { class: 'ui-root' }, [bar, desk])
    engine.ignoreChangesIn(root)
    document.body.append(root)
    return { bar, desk, cards, zoom, rulesText, closeButtons }
  }

  // Per card id: `w`, `h` (set once the card was resized; `h` only when its height was set) and `x`, `y`, `vw`, `vh` (set
  // once it was dragged, or by the fitted layout: where it sat, in a desk of `vw` x `vh`). A card with a place keeps its
  // gap to the nearer edges when the desk changes size, so zooming the browser out and back in returns the same layout.
  // `fitted` marks an entry the fitted layout wrote. Otherwise `hw` and `hh` are 1 for the axes the solver resized and
  // `placed` 1 once the solver dragged the card by its header.
  // `puzzle` beside the cards names the puzzle the sizes were set on (`engine.getOriginalPuzzleId()`).
  function readLayout () {
    // An unreadable layout is only card places, cheap to redo: the desk opens on the fitted one.
    const saved = readStored(LAYOUT_KEY, (stored) => stored !== null && typeof stored === 'object', {}, 'card places')
    const isNumbers = (entry) => entry && typeof entry === 'object' && Object.values(entry).every(Number.isFinite)
    const layout = {}
    Object.keys(CARD_TITLES).forEach((id) => {
      if (isNumbers(saved[id])) {
        layout[id] = saved[id]
      }
    })
    return { layout, puzzle: saved.puzzle }
  }

  // The left edge on a desk `deskWidth` wide of a card `width` wide whose kept entry has a place: the kept left edge, or for
  // a card that sat in the desk's right half, the kept gap to the right edge.
  const anchoredLeft = (entry, deskWidth, width) =>
    (entry.x + entry.w / 2 > entry.vw / 2 ? deskWidth - (entry.vw - entry.x - entry.w) - width : entry.x)

  // An entry from an older version carries no such flag: its size was the solver's, and its place too once it had one.
  const isByHand = (entry, flag) => Boolean(entry && !entry.fitted && (entry[flag] ?? (flag !== 'placed' || entry.x !== undefined)))
  const isAutomatic = (entry) => ['hw', 'hh', 'placed'].every((flag) => !isByHand(entry, flag))

  function setHeight (node, px) {
    node.style.height = `${px}px`
    node.classList.add('is-sized')
  }

  const columnWidthFor = (deskWidth) => Math.max(MIN_COLUMN_WIDTH_PX,
    Math.min(COLUMN_WIDTH_PX, Math.floor((deskWidth - 4 * DESK_MARGIN_PX - MIN_BOARD_WIDTH_PX) / 2)))

  const boxOf = (node) => ({ left: node.offsetLeft, top: node.offsetTop, right: node.offsetLeft + node.offsetWidth, bottom: node.offsetTop + node.offsetHeight })
  const boxesMeet = (p, q) => p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom

  function meetingPairs (ids, box) {
    const pairs = new Map()
    ids.forEach((a, i) => ids.slice(i + 1).forEach((b) => {
      if (boxesMeet(box(a), box(b))) {
        pairs.set(`${a}/${b}`, [a, b])
      }
    }))
    return pairs
  }

  const columnMinWidth = (ids) => Math.max(MIN_COLUMN_WIDTH_PX, ...ids.map((id) => MIN_SIZE[id][0]))

  function rulesCardHeight ({ node, body }, cardWidth) {
    const probe = el('div', { class: body.className })
    probe.append(...[...body.childNodes].map((child) => child.cloneNode(true)))
    probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;box-sizing:border-box;height:auto;max-height:none;' +
            `width:${cardWidth - (node.offsetWidth - body.offsetWidth)}px;font-size:${getComputedStyle(body).fontSize};`
    node.append(probe)
    const needed = probe.offsetHeight + node.offsetHeight - body.offsetHeight
    probe.remove()
    return needed
  }

  // A card's height with nothing set on it, read and put back in one task, so no ResizeObserver sees the change.
  function naturalHeight (node) {
    const { height } = node.style
    const wasSized = node.classList.contains('is-sized')
    node.style.height = ''
    node.classList.remove('is-sized')
    const natural = node.offsetHeight
    node.style.height = height
    node.classList.toggle('is-sized', wasSized)
    return natural
  }

  const axesOf = (edges) => [...(edges.some((e) => e === 'left' || e === 'right') ? ['w'] : []), ...(edges.some((e) => e === 'top' || e === 'bottom') ? ['h'] : [])]

  // For Rules at least one line of its text at the size it shows; with no rules, exactly the one line a reload gives it.
  function minHeightOf (id, { node, body }) {
    if (id !== 'rules') {
      return MIN_SIZE[id][1]
    }
    if (isRulesEmpty(node)) {
      return rulesCardHeight({ node, body }, node.offsetWidth)
    }
    const style = getComputedStyle(body)
    // A rules line's own least height (desk.css's .ui-rules-line) can exceed the line height.
    const line = Math.max(parseFloat(style.lineHeight), body.firstElementChild ? parseFloat(getComputedStyle(body.firstElementChild).minHeight) || 0 : 0)
    const oneLine = line + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    return Math.max(MIN_SIZE.rules[1], Math.ceil(node.offsetHeight - body.clientHeight + oneLine))
  }

  function createLayout (desk, cards, bar) {
    let saved = {}
    let placesKept = null

    // The kept layout as this puzzle opens it: whole when its sizes were set on this puzzle, else only the places the solver
    // gave cards, the sizes left to the fit.
    function openLayout () {
      const { layout, puzzle } = readLayout()
      if (puzzle === engine.getOriginalPuzzleId()) {
        saved = layout
        return
      }
      const places = Object.entries(layout).filter(([, entry]) => entry.x !== undefined && !entry.fitted)
        .map(([id, { x, y, vw, vh }]) => [id, { x, y, vw, vh }])
      placesKept = places.length ? Object.fromEntries(places) : null
    }

    function writeLayout () {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...saved, puzzle: engine.getOriginalPuzzleId() }))
    }

    const isMoved = (id) => saved[id]?.x !== undefined

    function saveCard (id, node, { resized = [], placed = false } = {}) {
      isFitted = false
      const before = saved[id]
      const entry = {
        w: node.offsetWidth,
        hw: Number(resized.includes('w') || isByHand(before, 'hw')),
        hh: Number(resized.includes('h') || isByHand(before, 'hh')),
        placed: Number(placed || isByHand(before, 'placed'))
      }
      if (keepsHeight(id, node)) {
        entry.h = node.offsetHeight
      }
      if (isMoved(id)) {
        Object.assign(entry, { x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight })
      }
      saved[id] = entry
      writeLayout()
    }

    function keepPlace (id, node) {
      saved[id] = { ...saved[id], x: node.offsetLeft, y: node.offsetTop }
    }

    // `mouseCardHeight` and `modeCardHeight`: the Mouse and Mode cards' whole heights that fit every tool they are sized for at
    // a card width. `sizeMouseBody`: sizes the Mouse card's body again, for when it opens. `pinsCardHeightAtTwoRows`: the Pinned
    // card's height with its chips in two rows, or its own height when they already take more. Each set by whoever knows
    // the card's content. Until `mouseCardHeight` is set the desk keeps variant L's fixed layout.
    const fit = { mouseCardHeight: null, modeCardHeight: null, sizeMouseBody: null, pinsCardHeightAtTwoRows: null }
    let fitPending = true

    function startFit () {
      saved = {}
      fitPending = true
    }
    let isFitted = false

    const position = (id, x, y, w) => {
      const style = cards[id].node.style
      style.left = `${x}px`
      style.top = `${y}px`
      style.width = `${saved[id]?.w ?? Math.max(MIN_SIZE[id][0], w)}px`
    }

    const isShown = (id) => !cards[id].node.hidden
    const shownIds = (ids = Object.keys(cards)) => ids.filter((id) => isShown(id))

    function stack (ids, x, width) {
      let y = TOP_MARGIN_PX
      shownIds(ids).forEach((id) => {
        position(id, x, y, width)
        y += cards[id].node.offsetHeight + CARD_GAP_PX
      })
    }

    function layout () {
      const width = desk.clientWidth
      const height = desk.clientHeight
      desk.style.setProperty('--ui-text-scale', clamp(Math.min(width / TEXT_SCALE_FROM.w, height / TEXT_SCALE_FROM.h), 1, TEXT_SCALE_MAX))
      // Heights first, so a card the solver made taller pushes the ones below it in its column.
      shownIds().forEach((id) => {
        const { node } = cards[id]
        node.style.height = ''
        node.classList.remove('is-sized')
        if (saved[id]?.h && !isEmptyRulesCard(id, node)) {
          setHeight(node, saved[id].h)
        }
      })
      if (fitPending && fit.mouseCardHeight) {
        fitPending = false
        isFitted = true
        fitCards()
        if (placesKept) {
          const places = placesKept
          placesKept = null
          putBack(places)
        }
        return
      }
      const columnWidth = columnWidthFor(width)
      const rightX = width - DESK_MARGIN_PX - columnWidth
      const boardX = DESK_MARGIN_PX + columnWidth + DESK_MARGIN_PX
      stack(LEFT_COLUMN, DESK_MARGIN_PX, columnWidth)
      stack(RIGHT_COLUMN, rightX, columnWidth)
      position('board', boardX, TOP_MARGIN_PX, rightX - DESK_MARGIN_PX - boardX)
      if (!saved.board?.h) {
        setHeight(cards.board.node, Math.max(MIN_SIZE.board[1], height - 2 * TOP_MARGIN_PX))
      }
      keepShownInside(width, height)
    }

    function keepShownInside (width, height) {
      shownIds().forEach((id) => keepInside(id, cards[id].node, width, height))
    }

    const overlappingPairs = () => meetingPairs(shownIds(), (id) => cards[id].node.getBoundingClientRect())

    // The overlaps the solver made, which a kept layout does not say apart from the ones a smaller window makes: pairs of
    // cards with a kept place, saved in desks of one size, whose saved boxes meet there (a card saved with no height has its
    // current one). A fitted card counts, since the solver may have dragged a card over it.
    function deliberateOverlaps () {
      const boxSaved = (id) => {
        const { x, y, w, h = cards[id].node.offsetHeight } = saved[id]
        return { left: x, top: y, right: x + w, bottom: y + h }
      }
      const ids = shownIds().filter((id) => isMoved(id))
      const pairs = meetingPairs(ids, boxSaved)
      return new Map([...pairs].filter(([, [a, b]]) => saved[a].vw === saved[b].vw && saved[a].vh === saved[b].vh))
    }

    // Overlaps the solver did not make are nudged apart, never refitted, and what moved is kept; `before` holds the pairs to leave alone.
    function repairOverlaps (before) {
      const isNew = () => [...overlappingPairs()].filter(([key]) => !before.has(key)).map(([, pair]) => pair)
      if (!isNew().length) {
        return
      }
      const board = cards.board.node
      let left = board.offsetLeft
      let right = left + board.offsetWidth
      isNew().filter((pair) => pair.includes('board')).forEach((pair) => {
        const other = cards[pair.find((id) => id !== 'board')].node
        if (other.offsetLeft + other.offsetWidth / 2 < (left + right) / 2) {
          left = Math.max(left, other.offsetLeft + other.offsetWidth + DESK_MARGIN_PX)
        } else {
          right = Math.min(right, other.offsetLeft - DESK_MARGIN_PX)
        }
      })
      const nudged = []
      if (right - left >= MIN_SIZE.board[0]) {
        Object.assign(board.style, { left: `${left}px`, width: `${right - left}px` })
        nudged.push('board')
      }
      const moved = new Set()
      const roomBelow = (id, anchor) => desk.clientHeight - EDGE_MARGIN_PX - (boxOf(cards[anchor].node).bottom + CARD_GAP_PX) - minHeightOf(id, cards[id])
      isNew().forEach(([a, b]) => {
        if (!boxesMeet(boxOf(cards[a].node), boxOf(cards[b].node))) {
          return
        }
        // The Board only narrows; with no room to move either card they are squeezed apart, else the overlap stays (the desk is too small).
        const lowerFirst = cards[a].node.offsetTop > cards[b].node.offsetTop ? [[a, b], [b, a]] : [[b, a], [a, b]]
        const found = lowerFirst.filter(([id]) => id !== 'board' && !moved.has(id)).find(([id, other]) => roomBelow(id, other) >= 0)
        if (found) {
          moved.add(found[0])
          moveClear(...found)
          nudged.push(found[0])
        } else if (!lowerFirst[1].includes('board') && !lowerFirst[1].some((id) => moved.has(id)) && squeezeApart(...lowerFirst[1])) {
          lowerFirst[1].forEach((id) => moved.add(id))
          nudged.push(...lowerFirst[1])
        }
      })
      nudged.forEach((id) => keepDeskChange(id))
      // A fitted card's place is kept in memory only; with a layout kept, the nudge is written too.
      if (nudged.length && localStorage.getItem(LAYOUT_KEY) !== null) {
        writeLayout()
      }
    }

    // False, with nothing changed, when `lower` has no room for its least height either.
    function squeezeApart (upper, lower) {
      const [above, below] = [cards[upper], cards[lower]]
      const lowerBox = boxOf(below.node)
      const room = lowerBox.top - CARD_GAP_PX - above.node.offsetTop
      if (room >= minHeightOf(upper, above)) {
        setHeight(above.node, room)
        return true
      }
      const top = above.node.offsetTop + minHeightOf(upper, above) + CARD_GAP_PX
      if (lowerBox.bottom - top < minHeightOf(lower, below)) {
        return false
      }
      setHeight(above.node, minHeightOf(upper, above))
      below.node.style.top = `${top}px`
      setHeight(below.node, lowerBox.bottom - top)
      return true
    }

    function moveClear (id, anchor) {
      const { node } = cards[id]
      const top = boxOf(cards[anchor].node).bottom + CARD_GAP_PX
      node.style.top = `${top}px`
      const room = desk.clientHeight - EDGE_MARGIN_PX - top
      if (node.offsetHeight > room) {
        setHeight(node, room)
      }
    }

    function putBack (places) {
      isFitted = false
      shownIds(Object.keys(places)).forEach((id) => {
        const { fitted, ...size } = saved[id]
        saved[id] = { ...size, ...places[id], hw: 0, hh: 0, placed: 1 }
        keepInside(id, cards[id].node, desk.clientWidth, desk.clientHeight)
      })
      repairOverlaps(new Map())
    }

    // Unlike `position`, which gives a card its kept width, this sets every size itself.
    function place (id, x, y, w, h) {
      Object.assign(cards[id].node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px` })
      setHeight(cards[id].node, h)
    }

    // Rules takes all the room Mouse leaves when Mouse shows its rows, so neither card leaves a gap; where that is less than its
    // text, Rules keeps up to RULES_SHARE of the column (Chris, 2026-11-17). With Mouse closed, the whole column.
    function rulesHeightFor (width, columnHeight) {
      if (isRulesEmpty(cards.rules.node)) {
        return rulesCardHeight(cards.rules, width)
      }
      if (!isShown('mouse')) {
        return columnHeight
      }
      const room = columnHeight - CARD_GAP_PX
      const kept = Math.min(rulesCardHeight(cards.rules, width), Math.floor(RULES_SHARE * columnHeight))
      return clamp(Math.max(room - fit.mouseCardHeight(width), kept), MIN_SIZE.rules[1], room - MIN_SIZE.mouse[1])
    }

    // Where the column has room, Mode sits at its middle, never higher than under a two-row Pinned card, so a second row of pins
    // moves neither Mode nor Recent (Chris, 2026-11-17); with Pinned closed Mode sits at the top (ruled 2026-11-18).
    function placeRightColumn (x, width, columnHeight) {
      const bottom = TOP_MARGIN_PX + columnHeight
      const hasPins = isShown('pins')
      let top = TOP_MARGIN_PX
      if (hasPins) {
        const pins = cards.pins.node
        Object.assign(pins.style, { left: `${x}px`, top: `${TOP_MARGIN_PX}px`, width: `${width}px` })
        top += pins.offsetHeight + CARD_GAP_PX
      }
      const hasRecent = isShown('recent')
      const recentNeeds = hasRecent ? Math.max(MIN_SIZE.recent[1], naturalHeight(cards.recent.node)) : 0
      const recentRoom = hasRecent ? recentNeeds + CARD_GAP_PX : 0
      if (isShown('mode')) {
        const modeHeight = Math.max(MIN_SIZE.mode[1], Math.min(fit.modeCardHeight(width), bottom - top - recentRoom))
        const middle = TOP_MARGIN_PX + Math.round((columnHeight - modeHeight) / 2)
        const underTwoRows = TOP_MARGIN_PX + fit.pinsCardHeightAtTwoRows() + CARD_GAP_PX
        const wanted = hasPins ? Math.max(middle, underTwoRows) : TOP_MARGIN_PX
        const modeTop = Math.max(top, Math.min(wanted, bottom - recentRoom - modeHeight))
        place('mode', x, modeTop, width, modeHeight)
        top = modeTop + modeHeight + CARD_GAP_PX
      }
      if (hasRecent) {
        const recentHeight = Math.max(MIN_SIZE.recent[1], Math.min(recentNeeds, bottom - top))
        place('recent', x, bottom - recentHeight, width, recentHeight)
      }
    }

    function placeLeftColumn (x, width, rulesHeight, columnHeight) {
      if (!isShown('rules')) {
        place('mouse', x, TOP_MARGIN_PX, width, columnHeight)
        return
      }
      place('rules', x, TOP_MARGIN_PX, width, rulesHeight)
      if (isShown('mouse')) {
        place('mouse', x, TOP_MARGIN_PX + rulesHeight + CARD_GAP_PX, width, columnHeight - CARD_GAP_PX - rulesHeight)
      }
    }

    const isColumnFitted = (ids) => ids.some((id) => saved[id]) && ids.every((id) => !saved[id] || saved[id].fitted)

    // A card being opened still has the place it had when it closed, so it does not say where the column is.
    function columnPlace (ids, opening) {
      const live = shownIds(ids).find((id) => id !== opening)
      if (live) {
        return { x: cards[live].node.offsetLeft, w: cards[live].node.offsetWidth }
      }
      const entry = saved[ids.find((id) => saved[id])]
      return { x: anchoredLeft(entry, desk.clientWidth, entry.w), w: entry.w }
    }

    const leftColumn = { ids: LEFT_COLUMN, place: (x, w, h) => placeLeftColumn(x, w, isShown('rules') ? rulesHeightFor(w, h) : 0, h) }
    const rightColumn = { ids: RIGHT_COLUMN, place: placeRightColumn }

    function refitColumn ({ ids, place }, opening = null) {
      if (!isColumnFitted(ids) || !shownIds(ids).length) {
        return false
      }
      const { x, w } = columnPlace(ids, opening)
      place(x, w, desk.clientHeight - 2 * TOP_MARGIN_PX)
      keepFitted(shownIds(ids))
      return true
    }

    function automaticHeight (id) {
      const { node } = cards[id]
      const content = { mode: fit.modeCardHeight, mouse: fit.mouseCardHeight, rules: (w) => rulesCardHeight(cards.rules, w) }[id]
      const toBottom = desk.clientHeight - TOP_MARGIN_PX - node.offsetTop
      return Math.max(minHeightOf(id, cards[id]), Math.min(content ? content(node.offsetWidth) : toBottom, toBottom))
    }

    function setRecentHeight () {
      const { node } = cards.recent
      const box = boxOf(node)
      const roomTop = Math.max(TOP_MARGIN_PX, ...shownIds(Object.keys(cards).filter((id) => id !== 'recent'))
        .map((id) => boxOf(cards[id].node)).filter((other) => other.bottom <= box.top && other.left < box.right && other.right > box.left)
        .map((other) => other.bottom + CARD_GAP_PX))
      const height = Math.max(MIN_SIZE.recent[1], Math.min(naturalHeight(node), box.bottom - roomTop))
      node.style.top = `${box.bottom - height}px`
      setHeight(node, height)
    }

    function setAutomaticHeight (id) {
      const { node } = cards[id]
      if (id === 'recent') {
        setRecentHeight()
      } else if (id === 'pins') {
        node.style.height = ''
        node.classList.remove('is-sized')
      } else {
        setHeight(node, automaticHeight(id))
      }
    }

    function fitAutomatic () {
      const refitted = [leftColumn, rightColumn].filter((column) => refitColumn(column)).flatMap((column) => column.ids)
      shownIds().filter((id) => !refitted.includes(id) && saved[id] && !isByHand(saved[id], 'hh')).forEach((id) => {
        setAutomaticHeight(id)
        if (saved[id].fitted) {
          keepFitted([id])
        } else {
          saveCard(id, cards[id].node)
        }
      })
    }

    function putByHand (id, kept) {
      const { node } = cards[id]
      if (isByHand(kept, 'hw')) {
        node.style.width = `${kept.w}px`
      }
      if (isByHand(kept, 'hh') && kept.h !== undefined) {
        setHeight(node, kept.h)
      }
      if (isByHand(kept, 'placed')) {
        saved[id] = kept
      } else {
        saved[id] = { ...kept, x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight }
      }
      keepInside(id, node, desk.clientWidth, desk.clientHeight)
      saveCard(id, node)
    }

    // The desk is fitted afresh and only what the solver still holds by hand is put back over it, so a freed axis takes what a
    // fresh load gives; with nothing held, the kept layout goes, as on Reset layout.
    function fitAxes (id, axes) {
      const entry = saved[id]
      if (!entry || entry.fitted) {
        return
      }
      const hw = isByHand(entry, 'hw') && !axes.includes('w')
      const hh = isByHand(entry, 'hh') && !axes.includes('h')
      saved[id] = { ...entry, hw: Number(hw), hh: Number(hh), placed: Number(isByHand(entry, 'placed') && (hw || hh)) }
      const byHand = Object.entries(saved).filter(([cardId, other]) => isShown(cardId) && !isAutomatic(other))
      startFit()
      layout()
      if (!byHand.length) {
        localStorage.removeItem(LAYOUT_KEY)
        return
      }
      byHand.forEach(([cardId, kept]) => putByHand(cardId, kept))
    }

    // The Board's width cap leaves the left column its minimum and the right column its default width; width the board does not
    // need widens the side columns. Kept in memory, written only when a card is moved or resized.
    function fitCards () {
      const width = desk.clientWidth
      const height = desk.clientHeight
      const columnHeight = height - 2 * TOP_MARGIN_PX
      const hasLeft = shownIds(LEFT_COLUMN).length > 0
      const hasRight = shownIds(RIGHT_COLUMN).length > 0
      const gapCount = 2 + Number(hasLeft) + Number(hasRight)
      const leftMin = hasLeft ? columnMinWidth(LEFT_COLUMN) : 0
      let rightWidth = hasRight ? Math.max(columnWidthFor(width), columnMinWidth(RIGHT_COLUMN)) : 0

      const boardMax = Math.max(MIN_SIZE.board[0], width - gapCount * DESK_MARGIN_PX - leftMin - rightWidth)
      const board = cards.board
      board.node.style.width = `${boardMax}px`
      setHeight(board.node, Math.max(MIN_SIZE.board[1], columnHeight))
      const zoomedTo = boardView.zoomedCellPx()
      boardView.fitBoard()
      const drawnWidth = board.body.firstElementChild.getBoundingClientRect().width
      const boardWidth = clamp(Math.ceil(drawnWidth) + board.node.offsetWidth - boardView.bodyRoom().w, MIN_SIZE.board[0], boardMax)
      if (zoomedTo !== null) {
        boardView.zoomBoardTo(zoomedTo)
      }

      const leftMax = hasLeft ? Math.max(leftMin, width - gapCount * DESK_MARGIN_PX - boardWidth - rightWidth) : 0
      const hasMouse = isShown('mouse')
      const hasRules = isShown('rules')
      const neededHeight = (w) => (hasMouse ? fit.mouseCardHeight(w) : 0) + (hasRules ? rulesCardHeight(cards.rules, w) : 0) +
              (hasMouse && hasRules ? CARD_GAP_PX : 0)
      // Both cards only get shorter as they widen, so the narrowest width that fits is found by halving; when none does,
      // the cards take all the width there is.
      let leftWidth = leftMax
      if (hasLeft && neededHeight(leftMax) <= columnHeight) {
        let [low, high] = [leftMin, leftMax]
        while (high - low > LEFT_WIDTH_STEP_PX) {
          const middle = Math.floor((low + high) / 2)
          if (neededHeight(middle) <= columnHeight) {
            high = middle
          } else {
            low = middle
          }
        }
        leftWidth = neededHeight(low) <= columnHeight ? low : high
      }
      // Spare width widens both side columns alike, up to SIDE_COLUMN_MAX_PX; what one cannot take of its half goes to the other.
      const sideRoom = width - gapCount * DESK_MARGIN_PX - boardWidth
      const widened = (has, current, target) => (has ? clamp(target, current, Math.max(current, SIDE_COLUMN_MAX_PX)) : 0)
      const leftShare = widened(hasLeft, leftWidth, Math.floor(sideRoom / 2))
      rightWidth = widened(hasRight, rightWidth, sideRoom - leftShare)
      leftWidth = widened(hasLeft, leftWidth, sideRoom - rightWidth)

      const spare = width - boardWidth - leftWidth - rightWidth
      const gapsUpTo = (n) => Math.max(n * DESK_MARGIN_PX, Math.round(n * spare / gapCount))
      const boardGaps = 1 + Number(hasLeft)
      place('board', leftWidth + gapsUpTo(boardGaps), TOP_MARGIN_PX, boardWidth, Math.max(MIN_SIZE.board[1], columnHeight))
      if (hasRight) {
        placeRightColumn(leftWidth + boardWidth + gapsUpTo(boardGaps + 1), rightWidth, columnHeight)
      }
      if (hasLeft) {
        placeLeftColumn(gapsUpTo(1), leftWidth, hasRules ? rulesHeightFor(leftWidth, columnHeight) : 0, columnHeight)
      }
      keepShownInside(width, height)
      keepFitted(shownIds())
    }

    function keepFitted (ids) {
      ids.forEach((id) => {
        const node = cards[id].node
        saved[id] = { w: node.offsetWidth, x: node.offsetLeft, y: node.offsetTop, vw: desk.clientWidth, vh: desk.clientHeight, fitted: 1 }
        if (keepsHeight(id, node)) {
          saved[id].h = node.offsetHeight
        }
      })
    }

    // A right-column card that changes height lays the column out again while the solver has changed none of its cards; in a
    // changed column, an untouched card moves down from under the one above. Never while dragging, which would undo the drag's
    // resize; on a first size report, a card the solver dragged over this one does not push it down.
    function restackRight ({ first = false } = {}) {
      if (isDragging) {
        return
      }
      if (refitColumn(rightColumn)) {
        const shown = shownIds(RIGHT_COLUMN)
        shown.forEach((id) => keepInside(id, cards[id].node, desk.clientWidth, desk.clientHeight))
        keepFitted(shown)
      } else if (RIGHT_COLUMN.every((id) => !isMoved(id))) {
        layout()
      } else {
        let above = null
        shownIds(RIGHT_COLUMN).forEach((id) => {
          const { node } = cards[id]
          const pushes = above && (!first || saved[above.id]?.fitted)
          const clear = pushes && above.node.offsetTop + above.node.offsetHeight + CARD_GAP_PX
          // Below the desk's bottom it would leave the window, so the card the solver put it under stays over it.
          const fits = clear + minHeightOf(id, cards[id]) <= desk.clientHeight - EDGE_MARGIN_PX
          if (saved[id]?.fitted && clear && node.offsetTop < clear && fits) {
            node.style.top = `${clear}px`
            // Setting `top` alone leaves the card's height running past the desk's bottom.
            const room = desk.clientHeight - EDGE_MARGIN_PX - clear
            if (node.offsetHeight > room) {
              setHeight(node, Math.max(minHeightOf(id, cards[id]), room))
            }
            keepFitted([id])
          }
          above = { id, node }
        })
      }
    }

    // Each shown card's height when the cards last changed size, so a card that grows can tell which cards it newly covers.
    const heightsSeen = new Map()

    // One never saved gets no place of its own, which would read as placed by the solver.
    function keepDeskChange (id) {
      const entry = saved[id]
      if (entry?.fitted) {
        keepFitted([id])
        return
      }
      if (entry) {
        keepPlace(id, cards[id].node)
      }
      saveCard(id, cards[id].node)
    }

    // A card the solver moved or sized moves too, its size kept: the growth, not the solver, closed the gap (ruled 2026-11-17).
    function clearBelow (id, was) {
      const grown = cards[id].node
      shownIds().filter((other) => other !== id).forEach((other) => {
        const { node } = cards[other]
        const box = boxOf(node)
        const now = boxOf(grown)
        if (box.top < was.top || boxesMeet(box, was) || !boxesMeet(box, now)) {
          return
        }
        const top = now.bottom + CARD_GAP_PX
        const room = desk.clientHeight - EDGE_MARGIN_PX - top
        if (room < minHeightOf(other, cards[other])) {
          // Never under its least height, unless it already sat under it (Pinned's natural height can).
          const least = Math.min(minHeightOf(id, cards[id]), was.bottom - was.top)
          setHeight(grown, Math.max(least, box.top - CARD_GAP_PX - now.top))
          heightsSeen.set(id, grown.offsetHeight)
          keepDeskChange(id)
          return
        }
        if (node.offsetHeight > room) {
          setHeight(node, room)
        }
        node.style.top = `${top}px`
        heightsSeen.set(other, node.offsetHeight)
        keepDeskChange(other)
        clearBelow(other, box)
      })
    }

    // The pairs that overlap now, less each pair a grown card's old box did not certainly meet. A card grew down from its
    // top or up from its bottom, so its old box is read both ways, and a pair is old only if every reading of both its cards
    // meets: a card beside a grown one is read at its own old height too when it grew. `grown` is `[id, old height]` per card.
    function pairsBeforeGrowth (grown) {
      const pairs = overlappingPairs()
      const oldHeights = new Map(grown)
      const readings = (id) => {
        const box = boxOf(cards[id].node)
        if (!oldHeights.has(id)) {
          return [box]
        }
        const height = oldHeights.get(id)
        return [{ ...box, bottom: box.top + height }, { ...box, top: box.bottom - height }]
      }
      const certainlyMet = ([first, second]) => readings(first).every((a) => readings(second).every((b) => boxesMeet(a, b)))
      pairs.forEach((pair, key) => {
        if (pair.some((id) => oldHeights.has(id)) && !certainlyMet(pair)) {
          pairs.delete(key)
        }
      })
      return pairs
    }

    // A card that was closed is placed by the layout as it opens, so its first height is no growth.
    function keepGrowthClear () {
      const grown = shownIds().filter((id) => heightsSeen.has(id) && cards[id].node.offsetHeight > heightsSeen.get(id))
        .map((id) => [id, heightsSeen.get(id)])
      heightsSeen.clear()
      shownIds().forEach((id) => heightsSeen.set(id, cards[id].node.offsetHeight))
      if (isDragging) {
        return
      }
      const before = pairsBeforeGrowth(grown)
      grown.forEach(([id, height]) => {
        const { node } = cards[id]
        clearBelow(id, { ...boxOf(node), bottom: node.offsetTop + height })
      })
      // A card that grew upward (Recent, kept to its column's bottom) can reach a card beside it, which narrows away.
      if (grown.length) {
        repairOverlaps(before)
      }
    }

    function keepInside (id, node, deskWidth, deskHeight) {
      const minWidth = MIN_SIZE[id][0]
      const minHeight = minHeightOf(id, { node, body: node.querySelector('.ui-body') })
      const entry = saved[id]
      let x = node.offsetLeft
      let y = node.offsetTop
      if (isMoved(id)) {
        x = anchoredLeft(entry, deskWidth, node.offsetWidth)
        y = entry.y
        const savedHeight = entry.h ?? node.offsetHeight
        if (entry.y + savedHeight / 2 > entry.vh / 2) {
          y = deskHeight - (entry.vh - entry.y - savedHeight) - node.offsetHeight
        }
      }
      // A card may be as wide and as tall as the desk, not less its edge margins: a resize drag reaches the desk's edges,
      // and a card left there must come back from a reload at the same size.
      if (node.offsetWidth > deskWidth) {
        node.style.width = `${Math.max(minWidth, deskWidth)}px`
      }
      if (!isMoved(id) && y + node.offsetHeight > deskHeight - EDGE_MARGIN_PX) {
        setHeight(node, Math.max(minHeight, deskHeight - EDGE_MARGIN_PX - y))
      }
      if (node.offsetHeight > deskHeight) {
        setHeight(node, Math.max(minHeight, deskHeight))
      }
      node.style.left = `${Math.max(0, Math.min(x, deskWidth - node.offsetWidth))}px`
      node.style.top = `${Math.max(0, Math.min(y, deskHeight - node.offsetHeight))}px`
    }

    let isDragging = false

    function trackPointer (event, target, onMove, onEnd) {
      isDragging = true
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const startY = event.clientY
      let didMove = false
      const drag = new AbortController()
      target.setPointerCapture(event.pointerId)
      const move = (e) => {
        const [dx, dy] = [e.clientX - startX, e.clientY - startY]
        didMove ||= Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX
        if (didMove) {
          onMove(dx, dy)
        }
      }
      const end = () => {
        drag.abort()
        isDragging = false
        onEnd(didMove)
      }
      const { signal } = drag
      target.addEventListener('pointermove', move, { signal })
      target.addEventListener('pointerup', end, { signal })
      target.addEventListener('pointercancel', end, { signal })
    }

    // Cards raised by a press (on the body, the header or a resize handle) stack above the others, from the cards' own z-index
    // up to two below the top bar's, one short of a card with an open picker list (desk.css).
    function makeMovable (bar) {
      const firstZ = Number(getComputedStyle(cards.board.node).zIndex)
      const lastZ = Number(getComputedStyle(bar).zIndex) - 2
      let topZ = firstZ
      Object.entries(cards).forEach(([id, { node, head, handles }]) => {
        const minWidth = MIN_SIZE[id][0]
        // In the capture phase, since a drag's own handler stops the press from bubbling.
        node.addEventListener('pointerdown', () => {
          topZ = topZ >= lastZ ? firstZ : topZ + 1
          node.style.zIndex = topZ
        }, { capture: true })
        head.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || e.target.closest('wa-button, button, input')) {
            return
          }
          const from = { x: node.offsetLeft, y: node.offsetTop }
          trackPointer(e, head, (dx, dy) => {
            node.classList.add('is-dragging')
            const within = (value, room) => Math.max(0, Math.min(Math.max(EDGE_MARGIN_PX, value), room - EDGE_MARGIN_PX))
            node.style.left = `${within(from.x + dx, desk.clientWidth - node.offsetWidth)}px`
            node.style.top = `${within(from.y + dy, desk.clientHeight - node.offsetHeight)}px`
          }, (didMove) => {
            node.classList.remove('is-dragging')
            if (didMove) {
              keepPlace(id, node)
              saveCard(id, node, { placed: true })
            }
          })
        })
        handles.forEach((handle, i) => {
          const edges = Object.values(RESIZE_HANDLES)[i]
          handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) {
              return
            }
            const from = { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight }
            const minHeight = minHeightOf(id, cards[id])
            // An empty Rules card's height is not kept, so a resize leaves it its one line.
            const maxHeight = isEmptyRulesCard(id, node) ? minHeight : Infinity
            trackPointer(e, handle, (dx, dy) => {
              if (edges.includes('right')) {
                node.style.width = `${Math.max(minWidth, Math.min(desk.clientWidth - from.x, from.w + dx))}px`
              }
              if (edges.includes('bottom')) {
                setHeight(node, Math.max(minHeight, Math.min(maxHeight, desk.clientHeight - from.y, from.h + dy)))
              }
              if (edges.includes('left')) {
                const width = Math.min(from.x + from.w, Math.max(minWidth, from.w - dx))
                node.style.width = `${width}px`
                node.style.left = `${from.x + from.w - width}px`
              }
              if (edges.includes('top')) {
                const height = Math.min(maxHeight, from.y + from.h, Math.max(minHeight, from.h - dy))
                setHeight(node, height)
                node.style.top = `${from.y + from.h - height}px`
              }
            }, (didMove) => {
              if (didMove) {
                if (edges.includes('left') || edges.includes('top')) {
                  keepPlace(id, node)
                }
                saveCard(id, node, { resized: axesOf(edges) })
              }
            })
          })
          handle.addEventListener('dblclick', () => fitAxes(id, axesOf(edges)))
        })
      })
    }

    openLayout()
    fitPending = Object.keys(saved).length === 0
    layout()
    // With no kept layout the fit places the cards, and nothing is kept for a nudge to change.
    if (!fitPending) {
      repairOverlaps(deliberateOverlaps())
    }
    const nudged = (step) => {
      const before = overlappingPairs()
      step()
      repairOverlaps(before)
    }
    // A fitted layout nobody has changed is fitted again, so a window resized and back gets the layout a reload would: at
    // the first resize, and while the window keeps changing only nudged inside it, once more when it stops. A layout the
    // solver made keeps its cards, each by its nearer edges, and is nudged where the smaller window put cards over each other.
    let refitTimer = null
    const refit = () => {
      startFit()
      layout()
    }
    window.addEventListener('resize', () => {
      if (isFitted) {
        if (refitTimer === null) {
          refit()
        } else {
          nudged(layout)
        }
        clearTimeout(refitTimer)
        refitTimer = setTimeout(() => {
          refitTimer = null
          if (isFitted) {
            refit()
          }
        }, REFIT_DELAY_MS)
        return
      }
      // The automatic cards are fitted again first, so only what the solver placed is left to nudge.
      nudged(() => {
        layout()
        fitAutomatic()
      })
    })
    makeMovable(bar)
    // A card's first report is the size it opened with; restacking on it under a card the solver dragged over this one would move
    // it out from under, and a reload would not open on the saved layout.
    const reported = new Set()
    const restack = new ResizeObserver((entries) => {
      const first = entries.some(({ target }) => !reported.has(target))
      entries.forEach(({ target }) => reported.add(target))
      restackRight({ first })
    })
    RIGHT_COLUMN.forEach((id) => restack.observe(cards[id].node))
    const growth = new ResizeObserver(() => keepGrowthClear())
    Object.values(cards).forEach(({ node }) => growth.observe(node))

    const resetLayout = () => {
      startFit()
      placesKept = null
      localStorage.removeItem(LAYOUT_KEY)
      layout()
    }
    const setCardClosed = (id, closed) => {
      storeFlag(closedKey(id), CARD_CLOSED, closed)
      const before = overlappingPairs()
      cards[id].node.hidden = closed
      if (id === 'mouse' && !closed) {
        fit.sizeMouseBody?.()
      }
      if (isFitted) {
        isFitted = false
        startFit()
      } else {
        refitColumn(LEFT_COLUMN.includes(id) ? leftColumn : rightColumn, closed ? null : id)
      }
      layout()
      // A card opened into a column with no fitted place to give it (every card of it closed before the solver changed
      // the layout) comes back at the default place, which can be over the Board: mended as a window resize mends it.
      repairOverlaps(before)
    }
    return {
      relayout: layout,
      resetLayout,
      fit,
      // The tools Mode and Mouse are sized for changed. Only the side columns' heights depend on them, so the board is not
      // fitted again: a solver stepping through tools outside the pins would redraw it at every step.
      fitToTools: fitAutomatic,
      setCardClosed
    }
  }

  function placeHeading (bar) {
    const heading = bar.querySelector('.ui-heading')
    const controls = [...bar.children].filter((node) => node !== heading && !node.matches('.ui-spacer') && node.offsetWidth > 0)
    const isClear = () => heading.getBoundingClientRect().right + HEADING_GAP_PX <=
            Math.min(...controls.map((node) => node.getBoundingClientRect().left))
    bar.classList.remove('is-heading-left', 'is-compact')
    if (isClear()) {
      return
    }
    bar.classList.add('is-heading-left')
    if (!isClear()) {
      bar.classList.add('is-compact')
    }
  }

  // The spacer takes the room the controls leave, so it changes size with any control, one added later included.
  function watchHeading (bar) {
    const resized = new ResizeObserver(() => placeHeading(bar));
    [bar, bar.querySelector('.ui-heading'), bar.querySelector('.ui-spacer')].forEach((node) => resized.observe(node))
  }

  // The default lives in the stylesheet, so the buttons read it back from the page rather than from a constant.
  const rulesTextSize = (body) => parseFloat(getComputedStyle(body).getPropertyValue('--ui-rules-text'))

  function showRulesText ({ cards, rulesText }) {
    const { min, max } = RULES_TEXT_RANGE_PX
    const kept = readStored(RULES_TEXT_KEY, (size) => Number.isFinite(size) && size >= min && size <= max, null, `a size from ${min} to ${max}`)
    cards.rules.body.style.setProperty('--ui-rules-text', kept === null ? '' : `${kept}px`)
    const shown = rulesTextSize(cards.rules.body)
    const hasNoRules = isRulesEmpty(cards.rules.node)
    // Hidden, not just disabled: a link with no rules has no text to size, and a disabled button fails the contrast check.
    rulesText.smaller.parentElement.hidden = hasNoRules
    rulesText.smaller.disabled = shown <= min
    rulesText.bigger.disabled = shown >= max
  }

  function stepRulesText (desk, steps) {
    const { min, max, step } = RULES_TEXT_RANGE_PX
    const shown = rulesTextSize(desk.cards.rules.body)
    localStorage.setItem(RULES_TEXT_KEY, String(clamp(shown + steps * step, min, max)))
    showRulesText(desk)
  }

  const isCardClosed = (id) => localStorage.getItem(closedKey(id)) === CARD_CLOSED

  // Resolves to `{ bar, cards, closeButtons, relayout, resetLayout, fit, fitToTools, closeableCards, isCardClosed, setCardClosed }`
  // once the desk is built, and `window.boardView` mounted, for the files that fill the bar and the cards. `closeableCards` is
  // `[id, title]` per card the solver can close, in the Cards menu's order, and `closeButtons` each one's header ×, by id.
  window.deskReady = engine.ready.then(() => {
    const desk = build(engine.getInfo())
    CLOSEABLE_CARDS.forEach((id) => {
      desk.cards[id].node.hidden = isCardClosed(id)
    })
    boardView.mount(desk.cards.board.body)
    const deskLayout = createLayout(desk.desk, desk.cards, desk.bar)
    watchHeading(desk.bar)
    const resetLayout = () => {
      boardView.forgetZoom()
      localStorage.removeItem(RULES_TEXT_KEY)
      showRulesText(desk)
      deskLayout.resetLayout()
    }
    showRulesText(desk)
    desk.rulesText.smaller.addEventListener('click', () => stepRulesText(desk, -1))
    desk.rulesText.bigger.addEventListener('click', () => stepRulesText(desk, 1))
    boardView.watch(desk.zoom, desk.cards.board.node)
    return {
      bar: desk.bar,
      cards: desk.cards,
      closeButtons: desk.closeButtons,
      relayout: deskLayout.relayout,
      resetLayout,
      fit: deskLayout.fit,
      fitToTools: deskLayout.fitToTools,
      closeableCards: CLOSEABLE_CARDS.map((id) => [id, CARD_TITLES[id]]),
      isCardClosed,
      setCardClosed: deskLayout.setCardClosed
    }
  })
  // A failed load needs no second report: main.js shows its error dialog. Anything else that stopped the desk is thrown
  // again, so it shows as a page error.
  window.deskReady.catch((error) => engine.ready.then(() => { throw error }, () => {}))
})()
