// What the Redirect script and its two checks share. Not a check itself, so `test/**/*.test.mjs` skips it.
export const REDIRECT_SCRIPT = new URL('../userscript/penpa-redirect.user.js', import.meta.url)
export const UPSTREAM_URL = 'https://swaroopg92.github.io/penpa-edit/'
export const FORK_URL = 'https://chinstrap45.github.io/penpa-edit/'
export const RAW_SCRIPT_URL = 'https://raw.githubusercontent.com/chinstrap45/penpa-edit/master/userscript/penpa-redirect.user.js'
