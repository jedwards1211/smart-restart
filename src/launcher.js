import path from 'path'
import chokidar from 'chokidar'
import chalk from 'chalk'
const debug = require('debug')('smart-restart:launcher')

const natives = process.binding('natives')

process.on('message', options => {
  debug('message received')

  const rerequire = options.rerequire || {}
  const origRerequire = {...rerequire}

  const initial = path.resolve(options.main)
  const watcher = chokidar.watch(initial, {
    ignored: options.ignore,
    ignoreInitial: false,
    usePolling: options.usePolling,
    interval: options.interval || 100,
    binaryInterval: options.binaryInterval || 300
  })
  watcher.on("change", function(file) {
    if (rerequire[file]) {
      console.log(chalk.bold.red("[smart-restart]"), "File", path.relative(process.cwd(), file), "has changed, clearing require cache")
      for (let key in rerequire) delete require.cache[key]
      return
    }
    watcher.close()
    process.send({respawn: true, file})
  })

  const main = path.resolve(options.main)
  const module = require("module")
  const _load_orig = module._load
  module._load = function (name, parent, isMain) {
    const file = module._resolveFilename(name, parent)
    if (!origRerequire.hasOwnProperty(file)) {
      rerequire[file] = rerequire[file] || rerequire[parent.id] || false
    }
    if (options.includeModules || file.indexOf('node_modules') < 0) {
      if (!natives[file] && file !== main) {
        watcher.add(file)
      }
      else debug('ignoring module: ', name)
    } else {
      debug('ignoring module: ', name)
    }
    return _load_orig(name, parent, isMain)
  }
  require(main)
})

debug('sending message: ', {status: 'ready'})
process.send({status: 'ready'})

process.on('uncaughtException', err => {
  const message = {err: (err != null ? err.stack : void 0) || err}
  debug('sending message: ', message)
  process.send(message)
  process.exit()
})
