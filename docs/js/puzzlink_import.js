// Ours: wraps puzzlink.js's decode_puzzlink so a failed import keeps the current board (#18).

/* global pu:writable, panel_pu, UserSettings, PenpaText, DOMPurify, errorMsg, decode_puzzlink */
// The snake_case names are the ones upstream's scripts call and define, so they stay.
/* eslint-disable camelcase */

// Returns whether the import replaced the board. A failure shows an error and leaves the Load URL dialog open.
// eslint-disable-next-line no-unused-vars -- called from other scripts
function import_puzzlink (url) {
  const previous = pu
  const space_ids = ['nb_space1', 'nb_space2', 'nb_space3', 'nb_space4']
  const space = space_ids.map(id => document.getElementById(id).value)
  const tab_settings = UserSettings.tab_settings
  const source = document.getElementById('saveinfosource').value
  const restoreInputs = () => {
    space_ids.forEach((id, i) => { document.getElementById(id).value = space[i] })
    document.getElementById('saveinfosource').value = source
  }
  try {
    puzzlink_check_size(url)
    decode_puzzlink(url)
    if (pu !== previous) {
      return true
    }
    // decode_puzzlink shows its own error and keeps the board for a grid that is too big and a genre it lacks, but still zeroes the inputs and sets Source
    restoreInputs()
    return false
  } catch (e) {
    // decode_puzzlink has already swapped in the new board, zeroed the grid-size inputs and resized the canvas
    pu = previous
    restoreInputs()
    UserSettings.tab_settings = tab_settings
    pu.reset_frame()
    panel_pu.draw_panel()
    pu.mode_qa(pu.mode.qa)
    errorMsg(PenpaText.get('puzzlink_import_failed') + '<br>' + DOMPurify.sanitize(String(e)))
    return false
  }
}

// decode_puzzlink builds the board before it reads a clue, so a size it cannot build must stop before that.
function puzzlink_check_size (url) {
  const urldata = url.split('?')[1].split('/')
  if (urldata[1] === 'v:') {
    urldata.splice(1, 1)
  }
  if (urldata[1] === 'b') {
    urldata.splice(1, 1)
  }
  if (!/^[1-9]\d*$/.test(urldata[1]) || !/^[1-9]\d*$/.test(urldata[2])) {
    throw new Error('puzz.link size is not a whole number of at least 1: ' + urldata[1] + 'x' + urldata[2])
  }
}

// A clue cut off in the link decodes to NaN or null, and a clue with an arrow or a prefix keeps the NaN inside its text.
// eslint-disable-next-line no-unused-vars -- called from other scripts
function puzzlink_check_clues (puzzle) {
  for (const layer of ['number', 'numberS']) {
    for (const cell in puzzle.pu_q[layer]) {
      const text = puzzle.pu_q[layer][cell][0]
      if (text == null || String(text).includes('NaN')) {
        throw new Error('puzz.link clue ' + cell + ' in ' + layer + ' is ' + text)
      }
    }
  }
}
