// ==UserScript==
// @name         Penpa+ to ChinStrap
// @namespace    https://github.com/chinstrap45/penpa-edit
// @version      1.2.0
// @description  Opens every Penpa+ link on the ChinStrap fork, with the same query and # data; a solve link opens on its solve page.
// @match        https://swaroopg92.github.io/penpa-edit/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/chinstrap45/penpa-edit/master/userscript/penpa-redirect.user.js
// @downloadURL  https://raw.githubusercontent.com/chinstrap45/penpa-edit/master/userscript/penpa-redirect.user.js
// ==/UserScript==

(function () {
  const UPSTREAM_URL = 'https://swaroopg92.github.io/penpa-edit/'
  const FORK_URL = 'https://chinstrap45.github.io/penpa-edit/'

  if (location.href.startsWith(UPSTREAM_URL)) {
    const tail = location.href.slice(UPSTREAM_URL.length)
    const data = tail.replace(/^[^?#]*/, '')
    // A solve link says `m=solve` in its query or its # data. It opens on solve.html whatever page it named.
    const isSolve = data.split(/[?#&]/).includes('m=solve')
    // `replace`, so Back does not return to the upstream link and loop.
    location.replace(FORK_URL + (isSolve ? 'solve.html' + data : tail))
  }
})()
