// caneff: index.html's way back to the ChinStrap solve page (#364), the mirror of solve.html's Penpa+ button (#148): a button in
// Penpa+'s top row that saves the progress, then opens solve.html on the same link, which reads the progress back from the store.

// Penpa+ reads a link's settings from its `?`, or from its `#` when it has no `?`.
function linkParams() {
    return new URLSearchParams(location.search ? location.search.slice(1) : location.hash.slice(1));
}

async function openInChinStrap() {
    const goToChinStrap = () => { location.href = `solve.html${location.search}${location.hash}`; };
    if (await saveProgressNow()) {
        goToChinStrap();
        return;
    }
    const answer = await Swal.fire({
        title: 'Progress is not being saved',
        text: 'Saving in this browser is off or was cleared, so ChinStrap would open the puzzle without what you entered here.',
        showCancelButton: true,
        cancelButtonText: 'Stay here',
        confirmButtonText: 'Open anyway'
    });
    if (answer.isConfirmed) {
        goToChinStrap();
    }
}

// Only a solve link gets the button: solve.html has no setter.
function addChinStrapButton() {
    if (linkParams().get('m') !== 'solve') {
        return;
    }
    const button = document.createElement('button');
    button.id = 'chinstrap';
    button.textContent = 'ChinStrap';
    button.title = 'Open this puzzle in the ChinStrap solve page';
    button.addEventListener('click', openInChinStrap);
    document.getElementById('top_button').prepend(button);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addChinStrapButton);
} else {
    addChinStrapButton();
}
