const Identity = {
    // For messages speaking in the first person
    appOwner: "Swaroop",
    // For dismissing popups
    okButtonText: "ok 🙂",
    // Titles specific to popup types
    errorTitle: "Swaroop says",
    infoTitle: "Swaroop says",

    solveTitle: undefined,
    solveDefaultMessage: "Congratulations 🙂", // Default - Congratulations 🙂
    solveOKButtonText: "Hurray!",

    incorrectMessage: "Keep trying 🙂",

    // Usage Button Amendments
    addUsageButtons: {
        // "Submission Rules for GMPuzzles": "https://tinyurl.com/GMPuzzlesFormatting"
    }
};

(function() {
    const usageButtons = document.getElementById('usageButtons');
    for (let buttonName in Identity.addUsageButtons) {
        let button = document.createElement('a');
        button.setAttribute('href', Identity.addUsageButtons[buttonName]);
        button.setAttribute('target', '_blank');
        button.classList.add('button');
        button.textContent = buttonName;
        usageButtons.appendChild(button);
    }
})();