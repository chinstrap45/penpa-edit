// The tour (GLOSSARY.md **Tour**): on a first visit, one stop per difference from Penpa+'s page, each a popup anchored to
// its card or control while the rest of the page is dimmed. Skip, Escape or Done marks it seen in localStorage, and it is
// not shown again until Settings replays it (`window.solveTour.start`). A stop whose element is not shown (a closed card)
// is left out. Reaches Penpa+ only through `engine` (test/ui-boundary.test.mjs fails otherwise).
(function () {
    'use strict';

    const { el, onDeskReady } = window.uiKit;

    const TOUR_KEY = 'chinstrap-solve-tour-v1';
    const TOUR_SEEN = 'seen';
    // The gap between a stop's popup and the element it points at, and how far the lit window reaches past that element.
    const POPUP_DISTANCE_PX = 12;
    const SPOTLIGHT_PAD_PX = 4;

    onDeskReady(({ bar, cards }) => {
        // One short line each, saying only what differs from Penpa+'s page (Chris, 2026-11-22).
        const STOPS = [
            [cards.board.head, 'Drag a card by its title, resize from any edge, close with ×. Layout is kept.'],
            [cards.mode.node, 'Mode offers every tool this grid supports.'],
            [cards.pins.node, 'Pin tools here; Z X C V pick the first four. Recent keeps the last ones.'],
            [cards.mouse.node, 'Hold Shift for Corner marks or Ctrl for Centre marks.'],
            [bar.querySelector('.ui-try'), 'Try starts a trial; then Keep or Discard what you entered.'],
            [cards.rules.head.querySelector('.ui-rules-text'), 'The Rules card has its own text size.'],
            [bar.querySelector('.ui-open-penpa'), 'Penpa+ opens this puzzle there; its ChinStrap button brings you back.']
        ];

        const text = el('p', { class: 'ui-tour-text', id: 'ui-tour-text' });
        const count = el('span', { class: 'ui-tour-count' });
        const skip = el('wa-button', { size: 's', appearance: 'plain' }, ['Skip tour']);
        const next = el('wa-button', { size: 's', variant: 'brand' });
        const popup = el('wa-popup', { placement: 'bottom', distance: String(POPUP_DISTANCE_PX), flip: '', shift: '', arrow: '' }, [
            el('div', { class: 'ui-tour', role: 'dialog', 'aria-label': 'Tour', 'aria-describedby': text.id }, [
                text, el('div', { class: 'ui-tour-foot' }, [count, el('span', { class: 'ui-spacer' }), skip, next])])]);
        // The veil takes every click meant for the page under it; the spotlight dims all but the lit window and takes none.
        const veil = el('div', { class: 'ui-tour-veil' });
        const spotlight = el('div', { class: 'ui-tour-spotlight' });
        const root = document.querySelector('.ui-root');

        let shown = [];
        let index = 0;

        function light() {
            const box = shown[index][0].getBoundingClientRect();
            Object.assign(spotlight.style, {
                left: `${box.left - SPOTLIGHT_PAD_PX}px`,
                top: `${box.top - SPOTLIGHT_PAD_PX}px`,
                width: `${box.width + 2 * SPOTLIGHT_PAD_PX}px`,
                height: `${box.height + 2 * SPOTLIGHT_PAD_PX}px`
            });
        }

        function showStop() {
            const [target, line] = shown[index];
            text.textContent = line;
            count.textContent = `${index + 1} of ${shown.length}`;
            next.textContent = index === shown.length - 1 ? 'Done' : 'Next';
            popup.anchor = target;
            light();
        }

        function end() {
            localStorage.setItem(TOUR_KEY, TOUR_SEEN);
            popup.active = false;
            [popup, veil, spotlight].forEach((node) => node.remove());
            window.removeEventListener('resize', light);
        }

        function start() {
            shown = STOPS.filter(([target]) => target.checkVisibility());
            index = 0;
            root.append(veil, spotlight, popup);
            showStop();
            popup.active = true;
            window.addEventListener('resize', light);
            // Web Awesome hands focus back to what had it in a timeout queued as a dialog closes (Settings' replay); this one
            // runs after it.
            setTimeout(() => next.focus());
        }

        // The popup follows its element as the desk lays out, and the lit window follows the popup.
        popup.addEventListener('wa-reposition', () => {
            if (shown.length) {
                light();
            }
        });
        next.addEventListener('click', () => {
            if (index === shown.length - 1) {
                end();
                return;
            }
            index += 1;
            showStop();
        });
        skip.addEventListener('click', end);
        // Capture, ahead of Penpa+: Escape ends the tour wherever focus is.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popup.isConnected) {
                e.preventDefault();
                end();
            }
        }, true);

        window.solveTour = { start };
        if (localStorage.getItem(TOUR_KEY) !== TOUR_SEEN) {
            start();
        }
    });
})();
