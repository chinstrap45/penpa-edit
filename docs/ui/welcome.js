// A plain wa-dialog, so Web Awesome closes it on Escape and keys.js keeps that Escape from the board. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
  'use strict'

  const { el, onDeskReady } = window.uiKit

  // The key of the tour this dialog replaced, kept so a visitor who has seen that is not welcomed.
  const WELCOME_KEY = 'chinstrap-solve-tour-v1'
  const WELCOME_SEEN = 'seen'

  // Saying only what differs from Penpa+'s page (Chris, 2026-11-23, Q37).
  const LINES = [
    'Drag a card by its title, resize it from any edge, close it with ×. Your layout is kept.',
    'Pin tools in Pinned. Z X C V pick the first four; Tab, Shift+Tab or the mouse wheel anywhere without a scroll bar steps through them. Recent keeps your last tools.',
    'Mode lists every tool this grid has.',
    'Try starts a trial. Keep or Discard it later.',
    'Penpa+ opens this puzzle in Penpa+; its Back to new UI button brings you back.'
  ]

  onDeskReady(() => {
    const root = document.querySelector('.ui-root')

    // Built afresh and removed on wa-after-hide, the end of its closing animation.
    function start () {
      const dialog = el('wa-dialog', { class: 'ui-welcome', label: 'Welcome to ChinStrap' }, [
        el('p', { class: 'ui-welcome-lead' }, ['What\'s different from Penpa+:']),
        el('ul', { class: 'ui-welcome-list' }, LINES.map((line) => el('li', {}, [line]))),
        el('wa-button', { slot: 'footer', variant: 'brand', 'data-dialog': 'close' }, ['Start solving'])])
      dialog.addEventListener('wa-after-hide', (e) => {
        if (e.target === dialog) {
          dialog.remove()
        }
      })
      root.append(dialog)
      dialog.open = true
    }

    window.solveWelcome = { start }
    if (localStorage.getItem(WELCOME_KEY) !== WELCOME_SEEN) {
      localStorage.setItem(WELCOME_KEY, WELCOME_SEEN)
      start()
    }
  })
})()
