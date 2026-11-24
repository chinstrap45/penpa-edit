(function () {
  'use strict'

  const { chipLabel, tooltipAttrs, toolKey, findTool } = window.toolGuide
  const { el, iconButton, luminance, onDeskReady, readStored, visibleBox } = window.uiKit

  const STORAGE_PREFIX = 'chinstrap.pins:'
  const SHORTCUT_SLOT_BY_CODE = { KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3 }
  const SHORTCUT_LABELS = Object.keys(SHORTCUT_SLOT_BY_CODE).map((code) => code.slice('Key'.length))
  const STEP_KEYS = ['Tab', 'Enter']
  // One wheel step per this much deltaY (Chris, 2026-11-23): a Chrome wheel notch sends about 100 (120 on some mice), a trackpad
  // a stream of small deltas, so one large event is a step and small ones add up. Chrome's documented sizes, not measured here: tune against a trackpad.
  const WHEEL_STEP_DELTA = 100
  // Deltas that came a pause apart are not one swipe, so a leftover from the last one does not count towards the next.
  const WHEEL_SWIPE_GAP_MS = 300
  // `WheelEvent.deltaMode` of 1 counts lines and 2 pages; a line is about this many pixels.
  const WHEEL_LINE_PX = 40
  // One swipe of small deltas moves at most this many steps, so a flick and its momentum do not run through every pin. A notch
  // is never capped: a solver spinning the wheel wants every step.
  const WHEEL_MAX_SWIPE_STEPS = 3
  const NUMBER_MODE = 'number'
  const EMPTY_NOTE_TEXT = 'Nothing pinned. Use the pin button beside the Mode picker, on a row of its list, or on a Recent chip, to pin a tool.'
  // Colour number `n` is the golden angle times `n` around the hue wheel, so each new colour lands in the widest gap left and no
  // count of pins runs out. Every hue is lit to one luminance: white on 0.16 is 5:1, past WCAG's 4.5:1 for a filled chip and the
  // Board label, while as light as that allows, so hues are told apart at chip size.
  const GOLDEN_ANGLE_DEG = 137.508
  const PIN_HUE_OFFSET_DEG = 220
  const PIN_SATURATION_PERCENT = 80
  const PIN_LUMINANCE = 0.16
  const LIGHTNESS_STEPS = 20
  const NEUTRAL_COLOUR = 'var(--ui-neutral-colour)'
  const PIN_SHAPE = '<path d="M5.5 1.5h5l-.8 4.2 2.3 2.8H4l2.3-2.8z"/><path d="M8 8.5v6"/>'
  const UNPIN_ALL_ICON = `${PIN_SHAPE}<path d="M2 2l12 12"/>`
  // A circled minus, not a ×: a tool's name can end in one ("○ △ □ ×, black").
  const REMOVE_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M5 8h6"/></svg>'

  function pinColourOfHue (h) {
    const hsl = (lightness) => `hsl(${h} ${PIN_SATURATION_PERCENT}% ${lightness}%)`
    let [dark, light] = [0, 100]
    for (let i = 0; i < LIGHTNESS_STEPS; i++) {
      const mid = (dark + light) / 2;
      [dark, light] = luminance(hsl(mid)) < PIN_LUMINANCE ? [mid, light] : [dark, mid]
    }
    return hsl(Math.floor(dark * 10) / 10)
  }

  // Penpa+ tells Caps Lock by the letter's case against Shift, so a keyboard with it on is read the same here.
  function capsLockIsOn (e) {
    const isLetter = e.key.length === 1 && e.key.toLowerCase() !== e.key.toUpperCase()
    return e.getModifierState('CapsLock') || (isLetter && (e.key === e.key.toUpperCase()) !== e.shiftKey)
  }

  onDeskReady(({ cards, fit }) => {
    const tools = engine.listTools()
    const storageKey = STORAGE_PREFIX + engine.getOriginalPuzzleId()
    const toolOf = (pin) => findTool(tools, pin)

    const isSavedState = (saved) => Array.isArray(saved?.pins) && saved.pins.every((p) => typeof p.mode === 'string')
    const savedState = () => readStored(storageKey, isSavedState, null, 'pins')

    function seededState () {
      return { pins: engine.tabSet().map((tool) => ({ mode: tool.mode, submode: tool.submode, style: null })) }
    }

    let { pins, colours } = savedState() ?? seededState()
    pins = pins.filter(toolOf)
    const validColours = Object.fromEntries(Object.entries(colours ?? {}).filter(([, n]) => Number.isInteger(n) && n >= 0))

    const pinIndexOf = (tool) => pins.findIndex((p) => toolKey(p) === toolKey(tool))

    // Gives each pin its tool's colour number, and a tool with none, or one a pin already wears, the next number nobody has had, so
    // no two pins share a colour and a tool unpinned for a while still finds its own.
    function assignColours () {
      const worn = new Set()
      pins.forEach((pin) => {
        const key = toolKey(pin)
        if (validColours[key] === undefined || worn.has(validColours[key])) {
          validColours[key] = Math.max(-1, ...Object.values(validColours)) + 1
        }
        worn.add(validColours[key])
      })
    }

    const pinColour = (pin) => pinColourOfHue((PIN_HUE_OFFSET_DEG + validColours[toolKey(pin)] * GOLDEN_ANGLE_DEG) % 360)

    function save () {
      assignColours()
      localStorage.setItem(storageKey, JSON.stringify({ pins, colours: validColours }))
    }
    save()

    // Saves the pins and draws them again.
    function commit () {
      save()
      render()
    }

    window.uiKeys.describe('Tools', () => (pins.length
      ? [
          { keys: STEP_KEYS.join(', '), text: 'Next pinned tool' },
          { keys: STEP_KEYS.map((key) => `Shift+${key}`).join(', '), text: 'Previous pinned tool' },
          { keys: 'Wheel over the board', text: 'Down steps the pins like Tab, up like Shift+Tab' },
          {
            keys: SHORTCUT_LABELS.join(' '),
            text: `Jump to pinned tool 1 to ${SHORTCUT_LABELS.length}, except in Number mode`,
            state: engine.getSettings().shortcuts_enabled ? 'On' : 'Off: turn it on in Settings > Keys'
          }
        ]
      : []))

    // The last pin the solver was on, for stepping from a tool that is not one.
    let cursor = -1

    function setPinTool (pin) {
      engine.setTool({ mode: pin.mode, submode: pin.submode, ...(pin.style === null ? {} : { style: pin.style }) })
    }

    // The engine's `change` comes a frame after the style button, so the style of the tool being left is taken now.
    function applyPin (pin) {
      followTool()
      setPinTool(pin)
    }

    function stepTarget (delta) {
      const here = pinIndexOf(engine.getTool())
      const from = here >= 0 ? here : Math.min(cursor, pins.length - 1)
      if (from < 0) {
        return delta > 0 ? 0 : pins.length - 1
      }
      return (from + delta + pins.length) % pins.length
    }

    // A hold lends the tool it shows; the step starts from the tool before it.
    function step (delta) {
      engine.releaseHolds()
      applyPin(pins[stepTarget(delta)])
    }

    // Enter does what Tab does, and Penpa+ never sees it, since Penpa+ would step its own Tab set; on a focused button keys.js
    // gives Enter to the button before this runs. With no pins neither key is ours, so the browser keeps them.
    window.uiKeys.add((e) => {
      if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      if (STEP_KEYS.includes(e.key)) {
        if (!pins.length) {
          return 'browser'
        }
        e.preventDefault()
        step(e.shiftKey ? -1 : 1)
        return 'ui'
      }
      const slot = SHORTCUT_SLOT_BY_CODE[e.code]
      if (slot !== undefined && engine.getTool().mode !== NUMBER_MODE && !capsLockIsOn(e) && engine.getSettings().shortcuts_enabled) {
        e.preventDefault()
        if (pins[slot]) {
          // As for Tab: a held Shift lends its tool no longer once the solver jumps away from it.
          engine.releaseHolds()
          applyPin(pins[slot])
        }
        return 'ui'
      }
    })

    // The wheel over the board: down is Tab and up is Shift+Tab, and the board does not scroll under it. Elsewhere the wheel is
    // the page's, so the Rules card keeps scrolling; so does a board zoomed past its card, which the wheel then scrolls.
    const boardBody = cards.board.body
    let wheelSum = 0
    let wheelAt = -Infinity
    let swipeSteps = 0
    boardBody.addEventListener('wheel', (e) => {
      const scrolls = boardBody.scrollHeight > boardBody.clientHeight || boardBody.scrollWidth > boardBody.clientWidth
      if (!pins.length || e.ctrlKey || e.deltaY === 0 || scrolls) {
        return
      }
      e.preventDefault()
      const delta = e.deltaY * (e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? WHEEL_STEP_DELTA : 1)
      if (e.timeStamp - wheelAt > WHEEL_SWIPE_GAP_MS) {
        swipeSteps = 0
      }
      if (e.timeStamp - wheelAt > WHEEL_SWIPE_GAP_MS || Math.sign(delta) !== Math.sign(wheelSum)) {
        wheelSum = 0
      }
      wheelAt = e.timeStamp
      if (Math.abs(delta) >= WHEEL_STEP_DELTA) {
        // A notch is a step even when it is 120 and not 100, so its extra is dropped, not carried.
        wheelSum = 0
        step(Math.sign(delta))
        return
      }
      wheelSum += delta
      while (Math.abs(wheelSum) >= WHEEL_STEP_DELTA) {
        const direction = Math.sign(wheelSum)
        wheelSum -= direction * WHEEL_STEP_DELTA
        if (swipeSteps < WHEEL_MAX_SWIPE_STEPS) {
          swipeSteps += 1
          step(direction)
        }
      }
    }, { passive: false })

    const strip = el('div', { class: 'ui-pins' })
    cards.pins.body.replaceChildren(strip)
    // The strip's rows are told apart by their tops; with no pin, its one row is the empty note.
    fit.pinsCardHeightAtTwoRows = () => {
      const items = [...strip.children]
      const rows = new Set(items.map((item) => item.offsetTop)).size
      // A strip with no gap set reads `normal`, which is none.
      const rowHeight = Math.max(0, ...items.map((item) => item.offsetHeight)) + (parseFloat(getComputedStyle(strip).rowGap) || 0)
      return cards.pins.node.offsetHeight + Math.max(0, 2 - rows) * rowHeight
    }

    const unpinAll = iconButton(UNPIN_ALL_ICON, 'Unpin all', () => window.pinBoard.replace([]))
    unpinAll.node.classList.add('ui-unpin-all')
    cards.pins.head.append(unpinAll.node)

    let dragged = null

    function movePin (pin, target, before) {
      if (pin === target) {
        return
      }
      const cursorPin = pins[cursor]
      pins = pins.filter((p) => p !== pin)
      pins.splice(pins.indexOf(target) + (before ? 0 : 1), 0, pin)
      cursor = pins.indexOf(cursorPin)
      commit()
    }

    function chip (pin, slot, current) {
      const label = chipLabel(toolOf(pin))
      const shortcut = SHORTCUT_LABELS[slot]
      // The space is not drawn (flex items drop it); it keeps the chip's text and name readable as "Z Line > Normal".
      const main = el('button', { type: 'button', class: 'ui-chip-main', 'aria-pressed': String(current), ...tooltipAttrs(toolOf(pin)) },
        [...(shortcut ? [el('span', { class: 'ui-chip-num' }, [shortcut]), ' '] : []), label])
      const unpin = el('button', { type: 'button', class: 'ui-chip-unpin', 'aria-label': `Unpin ${label}`, title: `Unpin ${label}` })
      unpin.innerHTML = REMOVE_ICON
      const choose = () => {
        applyPin(pin)
        main.blur()
      }
      main.addEventListener('click', choose)
      unpin.addEventListener('click', () => {
        pins = pins.filter((p) => p !== pin)
        commit()
        unpin.blur()
      })
      const node = el('div', { class: `ui-chip${current ? ' is-current' : ''}`, style: `--ui-pin-colour:${pinColour(pin)}`, draggable: 'true' }, [main, unpin])
      node.addEventListener('dragstart', (e) => {
        dragged = pin
        e.dataTransfer.effectAllowed = 'move'
        // Firefox starts no drag without some data.
        e.dataTransfer.setData('text/plain', label)
      })
      // A press that moved a few pixels before the release starts a drag, and a drag suppresses `click`: one that ends on
      // the chip's own button is the solver's click. A reorder redraws the strip, which detaches this button; its box is then
      // all zeros, which a browser that reports a drag's end at 0, 0 would match.
      node.addEventListener('dragend', (e) => {
        dragged = null
        const { left, right, top, bottom } = main.getBoundingClientRect()
        if (main.isConnected && e.clientX >= left && e.clientX <= right && e.clientY >= top && e.clientY <= bottom) {
          choose()
        }
      })
      node.addEventListener('dragover', (e) => {
        if (dragged) {
          e.preventDefault()
        }
      })
      node.addEventListener('drop', (e) => {
        if (dragged) {
          e.preventDefault()
          const { left, width } = node.getBoundingClientRect()
          movePin(dragged, pin, e.clientX < left + width / 2)
        }
      })
      return node
    }

    function togglePin (tool) {
      const index = pinIndexOf(tool)
      if (index >= 0) {
        pins.splice(index, 1)
      } else {
        pins.push({ mode: tool.mode, submode: tool.submode, style: tool.style ?? null })
      }
      commit()
    }

    const pinIcon = (filled) => '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" stroke="currentColor" stroke-width="1.5" ' +
            `stroke-linejoin="round" stroke-linecap="round" fill="${filled ? 'currentColor' : 'none'}">${PIN_SHAPE}</svg>`

    // A pin icon button for whatever tool `toolNow()` returns: pressed while that tool is pinned, hidden for a tool the link
    // does not list. `sync()` redraws it, and only touches the DOM when what it shows changed: a write to the DOM makes the
    // engine report a `change`, which would call `sync()` again, every frame. A `shortcut` names its key in the label, where the
    // tool's name would be.
    function pinToggle (toolNow, shortcut = null) {
      const button = el('button', { type: 'button', class: 'ui-pin-toggle' })
      let drawn = ''
      function sync () {
        const tool = toolNow()
        const known = toolOf(tool)
        const pinned = pinIndexOf(tool) >= 0
        const now = `${known ? chipLabel(known) : ''}/${pinned}`
        if (now === drawn) {
          return
        }
        drawn = now
        button.hidden = !known
        button.setAttribute('aria-pressed', String(pinned))
        const verb = pinned ? 'Unpin' : 'Pin'
        const label = shortcut ? `${verb} (${shortcut})` : `${verb} ${known ? chipLabel(known) : ''}`.trim()
        button.setAttribute('aria-label', label)
        button.setAttribute('title', label)
        button.innerHTML = pinIcon(pinned)
      }
      button.addEventListener('click', () => {
        togglePin(toolNow())
        button.blur()
      })
      sync()
      return { node: button, sync }
    }

    // The Mode card's pin sits beside its tool picker, in the row the card leaves for it.
    const modePin = pinToggle(() => engine.getTool())
    cards.mode.body.querySelector('.ui-picker-row').append(modePin.node)

    const { PIN_SHORTCUT, PIN_SLOT } = window.modeTree
    const rowPins = [...cards.mode.body.querySelectorAll(`.ui-trow[data-mode] .${PIN_SLOT}`)].map((slot) => {
      const { mode, submode } = slot.parentElement.dataset
      const toggle = pinToggle(() => ({ mode, submode: submode || null }), PIN_SHORTCUT)
      toggle.node.setAttribute('tabindex', '-1')
      slot.append(toggle.node)
      return toggle
    })
    window.uiKeys.describe('Tools', [{ keys: PIN_SHORTCUT, text: 'With a tool focused in the Mode picker, pin or unpin it' }])

    const flash = el('div', { class: 'ui-flash', 'aria-hidden': 'true' })
    cards.board.node.append(flash)

    // The flash sits at the top of the grid's visible part, centred: the board canvas's box cut to what the body shows, so a
    // zoomed or scrolled board keeps it in view. The canvas, not the board's wrapper, which also holds the coordinate bands.
    const FLASH_INSET_PX = 6
    function placeFlash () {
      const card = cards.board.node.getBoundingClientRect()
      const view = visibleBox(cards.board.body)
      const canvas = [...cards.board.body.querySelectorAll('canvas')].find((c) => c.offsetWidth > 0).getBoundingClientRect()
      const left = Math.max(view.left, canvas.left)
      const right = Math.min(view.right, canvas.right)
      const top = Math.max(view.top, canvas.top)
      // A board scrolled out of the body's view leaves no overlap: the flash then sits on the body's own top edge.
      const box = left < right && top < view.bottom ? { left, right, top } : view
      flash.style.left = `${(box.left + box.right) / 2 - card.left}px`
      flash.style.top = `${box.top - card.top + FLASH_INSET_PX}px`
    }

    // Restarts the CSS animation, which fades the name out on its own.
    function flashTool (tool, colour) {
      flash.replaceChildren(chipLabel(tool))
      flash.style.setProperty('--ui-flash-colour', colour)
      placeFlash()
      flash.classList.remove('is-flashing')
      flash.getBoundingClientRect() // reading the layout restarts the CSS animation
      flash.classList.add('is-flashing')
    }

    let lastKey = null
    let drawn = ''

    // A tool that was just landed on, by a pin or by a pick that matches one, comes back with that pin's style; while it
    // stays current a style change is the pin's new one.
    function followTool () {
      // A tool a hold lends is no landing: it flashes nothing and changes no pin.
      if (engine.getState().held) {
        return
      }
      const current = engine.getTool()
      const index = pinIndexOf(current)
      const landed = lastKey !== null && toolKey(current) !== lastKey
      lastKey = toolKey(current)
      const tool = findTool(tools, current)
      if (landed && tool) {
        flashTool(tool, index >= 0 ? pinColour(pins[index]) : NEUTRAL_COLOUR)
      }
      if (index < 0) {
        return
      }
      cursor = index
      const pin = pins[index]
      // Straight to the engine: `applyPin` would first take the style just landed with as the pin's own.
      if (landed && pin.style !== null && pin.style !== current.style) {
        setPinTool(pin)
      } else if (pin.style !== current.style) {
        pin.style = current.style
        save()
      }
    }

    const pinListeners = []

    function render () {
      followTool()
      // Between two unpinned tools the signature holds, yet the Mode card's pin names the new one.
      modePin.sync()
      rowPins.forEach((toggle) => toggle.sync())
      const index = pinIndexOf(engine.getTool())
      const signature = JSON.stringify([pins, index])
      if (signature === drawn) {
        return
      }
      drawn = signature
      unpinAll.node.disabled = !pins.length
      pinListeners.forEach((listener) => listener())
      strip.replaceChildren(...(pins.length ? pins.map((pin, i) => chip(pin, i, i === index)) : [el('p', { class: 'ui-pins-empty' }, [EMPTY_NOTE_TEXT])]))
      cards.board.node.style.setProperty('--ui-tool-colour', index >= 0 ? pinColour(pins[index]) : NEUTRAL_COLOUR)
    }

    // What the presets read and replace. A pin for a tool the link lacks is left out, like a saved
    // pin the link no longer offers.
    window.pinBoard = {
      toggleButton: pinToggle,
      isPinned: (tool) => pinIndexOf(tool) >= 0,
      onChange: (listener) => pinListeners.push(listener),
      snapshot: () => pins.map(({ mode, submode, style }) => ({ mode, submode, style })),
      replace (entries) {
        pins = entries.filter(toolOf).map(({ mode, submode, style }) => ({ mode, submode, style: style ?? null }))
        commit()
      },
      // The pins the link's Tab set seeds, as on the puzzle's first visit.
      reseed () {
        window.pinBoard.replace(engine.tabSet())
      }
    }

    render()
    engine.on('change', render)
  })
})()
