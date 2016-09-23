import chalk from 'chalk'
import path from 'path'
import {spawn} from 'child_process'
import chokidar from 'chokidar'

const debug = require('debug')('smart-restart:supervisor')

module.exports = function launch(ops) {
  let lastErr = ''
  let child
  let watcher
  const options = {
    includeModules: false,
    ignore: /(\/\.|~$)/,
    respawnOnExit: true,
    command: process.argv[0],
    commandOptions: [],
    spawnOptions: {},
    args: [],
    ...ops,
  }
  if (!options.main) throw new Error('missing main')
  const initial = path.resolve(options.main)

  process.on('exit', () => child && child.kill())

  function respawn() {
    if (child) {
      debug('killing child...')
      child.kill()
    }
    if (watcher) watcher.close()

    watcher = chokidar.watch(initial, {
      ignored: options.ignore,
      ignoreInitial: false,
      usePolling: options.usePolling,
      interval: options.interval || 100,
      binaryInterval: options.binaryInterval || 300
    })
    watcher.on("change", function(file) {
      console.log(chalk.bold.red("[smart-restart]"), "File", path.relative(process.cwd(), file), "has changed, reloading.")
      respawn()
    })

    const args = [
      options.command,
      [
        ...options.commandOptions,
        path.resolve(__dirname, 'launcher.js'),
        ...options.args
      ],
      {
        ...options.spawnOptions,
        stdio: [0, 1, 2, 'ipc'],
      }
    ]

    debug('spawning child with args: ', args)
    child = spawn(...args)

    debug('spawned child pid: ', child.pid)
    child.on('message', message => {
      debug('message received')
      if (message.status === 'ready') {
        debug('sending message:', options)
        child.send(options, error => {
          if (error) debug(error.stack)
        })
        return
      }
      if (message.err && (!options.respawnOnExit || message.err !== lastErr)) {
        console.log(chalk.bold.red("[smart-restart]"), "can't execute file:", options.main)
        console.log(chalk.bold.red("[smart-restart]"), "error given was:", message.err)
        if (options.respawnOnExit) {
          lastErr = message.err
          console.log(chalk.bold.red("[smart-restart]"), "further repeats of this error will be suppressed...")
          respawn()
        }
      } else if (message.file) {
        debug('watching file: ', path.resolve(message.file))
        watcher.add(path.resolve(message.file))
      }
    })
  }

  respawn()
}
