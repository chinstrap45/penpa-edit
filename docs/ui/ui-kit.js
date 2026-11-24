// The helpers the solve UI files share (`window.uiKit`): element and button builders, the confirm dialog, the dark switch and
// the colour helper. Loaded before every file that reads it. Reaches Penpa+ only through `engine`
// (test/ui-boundary.test.mjs fails otherwise).
(function () {
  'use strict'

  function el (tag, attrs = {}, children = []) {
    const node = document.createElement(tag)
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value))
    node.append(...children)
    return node
  }
  let tooltipCount = 0

  // Shows `text` while the pointer is over `node`; returns the tooltip, whose text can be changed. Web Awesome finds the
  // node by id, so the tooltip lives in the body and the node stays the one element its callers append.
  function addTooltip (node, text) {
    node.id ||= `ui-tooltip-target-${++tooltipCount}`
    const tooltip = el('wa-tooltip', { for: node.id }, [text])
    engine.ignoreChangesIn(tooltip)
    document.body.append(tooltip)
    return tooltip
  }

  // A button showing a 16x16 line icon (`icon` is its SVG markup, drawn in currentColor), naming itself `label` to
  // screen readers and on hover, the hover label with its keyboard `shortcut` when it has one. `show(icon, label)`
  // swaps the icon and both labels, and does nothing when that icon is already shown.
  function iconButton (icon, label, onClick, shortcut = null) {
    const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' })
    const text = el('span', { class: 'ui-sr-only' })
    node.append(text)
    node.addEventListener('click', onClick)
    const tooltip = addTooltip(node, '')
    let shown = null
    function show (nextIcon, nextLabel) {
      if (nextIcon === shown) {
        return
      }
      shown = nextIcon
      node.querySelector('svg')?.remove()
      node.insertAdjacentHTML('afterbegin', '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" ' +
                `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${nextIcon}</svg>`)
      text.textContent = nextLabel
      tooltip.textContent = shortcut ? `${nextLabel} (${shortcut})` : nextLabel
    }
    show(icon, label)
    return { node, show }
  }

  // A button showing `text`, with `tooltip` on hover.
  function textButton (text, tooltip, onClick) {
    const node = el('wa-button', { appearance: 'filled', variant: 'neutral', size: 's' }, [text])
    node.addEventListener('click', onClick)
    addTooltip(node, tooltip)
    return { node }
  }

  // Runs `build(desk)` once the desk is built. A desk that never got built is reported once, where `deskReady` is made.
  function onDeskReady (build) {
    return window.deskReady.then(build, () => {})
  }

  // A wa-dialog asking `label` with `text` under it, a plain `cancel` button and a danger `confirm` one that runs `onConfirm`.
  // Both buttons close it. The caller adds the node to the page and opens it with `.open = true`.
  function confirmDialog ({ label, text, cancel, confirm, onConfirm }) {
    const dialog = el('wa-dialog', { label }, [text,
      el('wa-button', { slot: 'footer', appearance: 'plain', 'data-dialog': 'close' }, [cancel]),
      el('wa-button', { slot: 'footer', variant: 'danger', 'data-dialog': 'close' }, [confirm])])
    dialog.lastElementChild.addEventListener('click', onConfirm)
    return dialog
  }

  // The dark theme is a `wa-dark` class on the page, for Web Awesome, and a `ui-dark` class on the root of what the UI draws.
  function setDark (root, dark) {
    document.documentElement.classList.toggle('wa-dark', dark)
    root.classList.toggle('ui-dark', dark)
  }

  // WCAG's relative luminance of an opaque CSS colour. A canvas reads any such colour back as #rrggbb.
  const colourReader = document.createElement('canvas').getContext('2d')
  function luminance (colour) {
    colourReader.fillStyle = colour
    const [r, g, b] = [1, 3, 5].map((i) => {
      const s = parseInt(colourReader.fillStyle.slice(i, i + 2), 16) / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  // The part of a scrolling box that shows: its padding box, in viewport coordinates.
  function visibleBox (node) {
    const box = node.getBoundingClientRect()
    const left = box.left + node.clientLeft
    const top = box.top + node.clientTop
    return { left, top, right: left + node.clientWidth, bottom: top + node.clientHeight }
  }

  window.uiKit = { el, addTooltip, iconButton, textButton, onDeskReady, confirmDialog, setDark, luminance, visibleBox }
})()
