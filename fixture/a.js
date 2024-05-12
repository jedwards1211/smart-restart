const { inspect } = require('util')
let c = require('./c')
let e = require('./e')
const f = require('./f')

function logStatus() {
  console.log('in a', inspect({ c, e, f }, { depth: 100 }))
}

setInterval(logStatus, 1000)

if (module.hot) {
  module.hot.accept(['./c', './e'], () => {
    c = require('./c')
    e = require('./e')
  })
}
