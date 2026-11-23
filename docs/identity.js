const Identity = {
  // For messages speaking in the first person
  appOwner: 'ChinStrap',
  // For dismissing popups
  okButtonText: 'ok 🙂',
  // Titles specific to popup types
  errorTitle: 'ChinStrap says',
  infoTitle: 'ChinStrap says',

  solveTitle: undefined,
  solveDefaultMessage: 'Congratulations 🙂', // Default - Congratulations 🙂
  solveOKButtonText: 'Hurray!',

  incorrectMessage: 'Keep trying 🙂',

  // Usage Button Amendments
  addUsageButtons: {
    // "Submission Rules for GMPuzzles": "https://tinyurl.com/GMPuzzlesFormatting"
  }
};

(function () {
  const usageButtons = document.getElementById('usageButtons')
  for (const buttonName in Identity.addUsageButtons) {
    const button = document.createElement('a')
    button.setAttribute('href', Identity.addUsageButtons[buttonName])
    button.setAttribute('target', '_blank')
    button.classList.add('button')
    button.textContent = buttonName
    usageButtons.appendChild(button)
  }
})()
