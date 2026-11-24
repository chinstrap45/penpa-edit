// caneff: saves the progress first, because solve.html reads it back from the store.
async function openInChinStrap () {
  // The Penpa+ mark only keeps a link on index.html, so the jump drops it.
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
  const params = penpaLinkParams(location.search + location.hash)
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
