// The Cards menu is the one place a closed card is shown again.
// Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
  'use strict'

  const { el, iconButton, onDeskReady } = window.uiKit

  const CARDS_ICON = '<rect x="1.8" y="2.2" width="5.2" height="11.6" rx="1.2"/><rect x="9" y="2.2" width="5.2" height="5" rx="1.2"/>' +
        '<rect x="9" y="9.2" width="5.2" height="4.6" rx="1.2"/>'
  const RESET_VALUE = 'reset-layout'

  onDeskReady(({ bar, closeButtons, closeableCards, isCardClosed, setCardClosed, resetLayout }) => {
    const trigger = iconButton(CARDS_ICON, 'Cards', () => {})
    trigger.node.setAttribute('slot', 'trigger')
    const items = closeableCards.map(([id, title]) => el('wa-dropdown-item', { type: 'checkbox', value: id }, [title]))
    const menu = el('wa-dropdown', {}, [trigger.node, ...items, el('wa-divider'),
      el('wa-dropdown-item', { value: RESET_VALUE }, ['Reset layout'])])
    menu.addEventListener('wa-show', () => items.forEach((item) => { item.checked = !isCardClosed(item.value) }))
    menu.addEventListener('wa-select', (e) => {
      const { item } = e.detail
      if (item.value === RESET_VALUE) {
        resetLayout()
        return
      }
      // Web Awesome has already flipped the box. The menu stays open, so several cards are shown or hidden in one visit.
      e.preventDefault()
      setCardClosed(item.value, !item.checked)
    })

    Object.entries(closeButtons).forEach(([id, button]) => button.addEventListener('click', (e) => {
      setCardClosed(id, true)
      // A key press closed it, so the keyboard user stands on the control that brings it back; a mouse click hands the
      // keyboard back to the board (keys.js).
      if (e.detail === 0) {
        trigger.node.focus()
      }
    }))

    bar.append(menu)
  })
})()
