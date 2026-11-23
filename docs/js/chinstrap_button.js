// caneff: index.html's Back to new UI button, the way back to the solve page (#364), the mirror of solve.html's Penpa+ button (#148): a button in
// Penpa+'s top row that saves the progress, then opens solve.html on the same link, which reads the progress back from the store.

// Penpa+ reads a link's settings from its `?`, or from its `#` when it has no `?`.
function linkParams () {
  return new URLSearchParams(location.search ? location.search.slice(1) : location.hash.slice(1))
}

async function openInChinStrap () {
  // The Penpa+ button's mark, which only keeps a link on this page, is dropped (#376).
  const goToChinStrap = () => { location.href = `solve.html${withoutPenpaMark(location.search + location.hash)}` }
  if (await saveProgressNow()) {
    goToChinStrap()
    return
  }
  const answer = await Swal.fire({
    title: 'Progress is not being saved',
    text: 'Saving in this browser is off or was cleared, so the new UI would open the puzzle without what you entered here.',
    showCancelButton: true,
    cancelButtonText: 'Stay here',
    confirmButtonText: 'Open anyway'
  })
  if (answer.isConfirmed) {
    goToChinStrap()
  }
}

// Only a link Penpa+ opens as a solve gets the button, a solve's Clone (`l=solvedup`) included: solve.html has no setter.
function addChinStrapButton () {
  const params = linkParams()
  if (params.get('m') !== 'solve' && params.get('l') !== 'solvedup') {
    return
  }
  const button = document.createElement('button')
  button.id = 'chinstrap'
  button.textContent = 'Back to new UI'
  button.title = 'Open this puzzle in the new solve UI'
  button.addEventListener('click', openInChinStrap)
  document.getElementById('top_button').prepend(button)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addChinStrapButton)
} else {
  addChinStrapButton()
}
