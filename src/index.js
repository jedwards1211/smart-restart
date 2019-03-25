import chalk from 'chalk'
import path from 'path'
import {spawn} from 'child_process'

const debug = require('debug')('smart-restart:supervisor')

module.exports = function launch(ops) {
  let lastErr = ''
  let child
  const options = {
    includeModules: false,
    ignore: /(\/\.|~$)/,
    respawnOnExit: true,
    command: process.argv[0],
    commandOptions: [],
    spawnOptions: {},
    args: [],
    rerequire: {},
    ...ops,
  }
  if (!options.main) throw new Error('missing main')

  process.on('exit', () => child && child.kill())

  function respawn() {
    if (child) {
      debug('killing child...')
      child.kill()
    }

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
      if (message.respawn) {
        console.log(chalk.bold.red("[smart-restart]"), "File", path.relative(process.cwd(), message.file), "has changed, reloading.")
        respawn()
        return
      }
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
      }
    })
  }

  respawn()
}
