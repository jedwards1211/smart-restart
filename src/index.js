import chalk from 'chalk'
import path from 'path'
import {spawn} from 'child_process'
import chokidar from 'chokidar'

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
    if (child) child.kill()
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

    child = spawn(
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
    )
    child.on('message', message => {
      if (message.err && (!options.respawnOnExit || message.err !== lastErr)) {
        console.log(chalk.bold.red("[smart-restart]"), "can't execute file:", options.main)
        console.log(chalk.bold.red("[smart-restart]"), "error given was:", message.err)
        if (options.respawnOnExit) {
          lastErr = message.err
          console.log(chalk.bold.red("[smart-restart]"), "further repeats of this error will be suppressed...")
          respawn()
        }
      } else if (message.file) {
        watcher.add(path.resolve(message.file))
      }
    })

    child.send(options)
  }

  respawn()
}
