// The header is comma separated, so a comma becomes `%2C`. `%` is not escaped, to keep upstream's link format, so a
// `%2C` typed in the text reads back as a comma, as in upstream (Chris, 2026-11-13).
const HEADER_ESCAPES = { ',': '%2C', '\n': '%2D', '&': '%2E', '=': '%2F' }

function headerCodec (chars) {
  const codeOf = Object.fromEntries([...chars].map((c) => [c, HEADER_ESCAPES[c]]))
  const charOf = Object.fromEntries(Object.entries(codeOf).map(([c, code]) => [code, c]))
  const charPattern = new RegExp('[' + [...chars].map((c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('') + ']', 'g')
  const codePattern = new RegExp(Object.values(codeOf).join('|'), 'g')
  return {
    encode: (text) => text.replace(charPattern, (c) => codeOf[c]),
    decode: (text) => text.replace(codePattern, (code) => charOf[code])
  }
}

// eslint-disable-next-line no-unused-vars -- a global the page's scripts read
const HEADER_TEXT = { line: headerCodec(','), rules: headerCodec(',\n&=') }

// eslint-disable-next-line camelcase, no-unused-vars -- a global the page's scripts call, named as Penpa+ names its own
function header_text_to_html (text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
  return text.replace(/[&<>]/g, (c) => entities[c]).replace(/\n/g, '<br>')
}
