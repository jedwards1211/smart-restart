import path from 'path'

const natives = process.binding('natives')

process.on('message', options => {
  const main = path.resolve(options.main)
  const module = require("module")
  const _load_orig = module._load
  module._load = function (name, parent, isMain) {
    const file = module._resolveFilename(name, parent)
    if (options.includeModules || file.indexOf('node_modules') < 0) {
      if (!natives[file] && file !== main) process.send({file})
    }
    return _load_orig(name, parent, isMain)
  }
  require(main)
})

process.on('uncaughtException', err => {
  process.send({
    err: (err != null ? err.stack : void 0) || err,
  })
  process.exit()
})
