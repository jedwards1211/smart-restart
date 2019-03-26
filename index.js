#!/usr/bin/env node

'use strict'

/* eslint-disable no-console */

const chalk = require('chalk')
const path = require('path')
const { spawn } = require('child_process')
const chokidar = require('chokidar')
const debug = require('debug')('smart-restart:supervisor')

module.exports = function launch(ops) {
  let lastErr = ''
  let child
  let watcher
  let childRunning = false
  let restartWhenDone = false

  const options = Object.assign(
    {
      includeModules: false,
      ignore: /(\/\.|~$)/,
      restartOnError: true,
      killSignal: 'SIGINT',
      command: process.argv[0],
      commandOptions: [],
      spawnOptions: {},
      deleteRequireCache: [],
      args: [],
    },
    ops
  )
  const { killSignal } = options
  if (!options.main) throw new Error('missing main')
  const initial = path.resolve(options.main)

  const origDeleteRequireCache = new Set(options.deleteRequireCache)

  const deleteRequireCache = {
    [initial]: false,
  }
  options.deleteRequireCache.forEach(m => (deleteRequireCache[m] = true))
  process.on('exit', () => child && child.kill())

  function restart() {
    if (childRunning) {
      debug('killing child...')
      restartWhenDone = true
      child.kill(killSignal)
      if (killSignal === 'SIGKILL' || killSignal === 9) {
        childRunning = false
      } else {
        return
      }
    }
    if (watcher) watcher.close()

    watcher = chokidar.watch(initial, {
      ignored: options.ignore,
      ignoreInitial: false,
      usePolling: options.usePolling,
      interval: options.interval || 100,
      binaryInterval: options.binaryInterval || 300,
    })
    watcher.on('change', function(file) {
      if (deleteRequireCache[file]) {
        console.log(
          chalk.bold.red('[smart-restart]'),
          'File',
          path.relative(process.cwd(), file),
          'has changed, clearing require cache.'
        )
        for (let key in deleteRequireCache) {
          if (deleteRequireCache[key]) {
            delete require.cache[key]
          }
        }
        return
      }
      console.log(
        chalk.bold.red('[smart-restart]'),
        'File',
        path.relative(process.cwd(), file),
        'has changed, reloading.'
      )
      restart()
    })

    const args = [
      options.command,
      [
        ...options.commandOptions,
        path.resolve(__dirname, 'launcher.js'),
        ...options.args,
      ],
      Object.assign(options.spawnOptions, {
        stdio: [0, 1, 2, 'ipc'],
      }),
    ]

    debug('spawning child with args: ', args)
    child = spawn(...args)
    childRunning = true
    restartWhenDone = false

    function done() {
      childRunning = false
      if (restartWhenDone) {
        restart()
      }
    }

    child.on('exit', done)
    child.on('error', done)

    debug('spawned child pid: ', child.pid)
    child.on('message', message => {
      debug('message received')
      const { status, file, parent, err } = message
      if (status === 'ready') {
        debug('sending message:', options)
        child.send(options, error => {
          if (error) debug(error.stack)
        })
        return
      }
      if (err && (!options.restartOnError || err !== lastErr)) {
        console.log(
          chalk.bold.red('[smart-restart]'),
          "can't execute file:",
          options.main
        )
        console.log(chalk.bold.red('[smart-restart]'), 'error given was:', err)
        if (options.restartOnError) {
          lastErr = err
          console.log(
            chalk.bold.red('[smart-restart]'),
            'further repeats of this error will be suppressed...'
          )
          restart()
        }
      } else if (file) {
        if (file !== initial && !origDeleteRequireCache.has(file)) {
          deleteRequireCache[file] = deleteRequireCache[parent] || false
        }
        debug('watching file: ', path.resolve(file))
        watcher.add(path.resolve(file))
      }
    })
  }

  restart()

  function kill(signal = killSignal) {
    if (child != null) {
      const finalChild = child
      child = null
      finalChild.kill(signal)
    }
  }

  return {
    restart,
    kill,
  }
}

if (!module.parent) {
  const mainIndex = process.argv.findIndex((arg, i) => i > 1 && arg[0] !== '-')
  const main = process.argv[mainIndex]
  const commandOptions = process.argv.slice(3, mainIndex)
  const args = process.argv.slice(mainIndex + 1)
  module.exports({
    main,
    commandOptions,
    args,
  })
}
