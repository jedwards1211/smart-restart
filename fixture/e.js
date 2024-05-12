let i = require('./i')
let j = require('./j')

module.exports = { i, j }

if (module.hot) {
  module.hot.accept('./i', () => (i = module.exports.i = require('./i')))
}
