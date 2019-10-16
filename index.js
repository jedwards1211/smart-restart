#!/usr/bin/env node

'use strict'

/* eslint-disable no-console */

const chalk = require('chalk')
const path = require('path')
const { spawn } = require('child_process')
const chokidar = require('chokidar')
const debug = require('debug')('smart-restart:supervisor')
const { debounce } = require('lodash')

function log(...args) {
  console.log(chalk.bold.red('[smart-restart]'), ...args)
}

module.exports = function launch(ops) {
  let lastErr = ''
  let child
  let watcher
  let childRunning = false
  let killTimeout = null

  const options = Object.assign(
    {
      includeModules: false,
      ignore: /(\/\.|~$)/,
      restartOnError: true,
      restartOnExit: true,
      killSignal: 'SIGINT',
      command: process.argv[0],
      commandOptions: [],
      spawnOptions: {},
      deleteRequireCache: [],
      args: [],
    },
    ops
  )
  const { killSignal, onChildSpawned } = options
  if (!options.main) throw new Error('missing main')
  const initial = path.resolve(options.main)

  const origDeleteRequireCache = new Set(options.deleteRequireCache)

  const deleteRequireCache = {
    [initial]: false,
  }
  options.deleteRequireCache.forEach(m => (deleteRequireCache[m] = true))
  process.on('exit', () => child && child.kill())

  function done(codeOrError, signal) {
    if (codeOrError instanceof Error) {
      log('child process error:', codeOrError.message)
    } else if (typeof codeOrError === 'number') {
      log('process exited with code', codeOrError)
    } else if (signal != null) {
      log('process was killed with', signal)
    }

    childRunning = false
    if (options.restartOnExit) restart()
  }

  function restart() {
    if (childRunning) {
      if (killTimeout == null) {
        log('killing process with', killSignal)
        child.kill(killSignal)
        killTimeout = setTimeout(() => {
          childRunning = false
          restart()
        }, ops.killTimeout || 10000)
      }
      return
    }

    // clean up everything from previous launch
    kill('SIGKILL')

    watcher = chokidar.watch(initial, {
      ignored: options.ignore,
      ignoreInitial: false,
      usePolling: options.usePolling,
      interval: options.interval || 100,
      binaryInterval: options.binaryInterval || 300,
    })
    watcher.on('change', function(file) {
      log('File', path.relative(process.cwd(), file), 'has changed')
      if (deleteRequireCache[file]) clearRequireCacheSoon()
      else restartSoon()
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

    log('spawning process')
    child = spawn(...args)
    childRunning = true

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
        log('child process error:', err)
        if (options.restartOnError) {
          lastErr = err
          log('further repeats of this error will be suppressed...')
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

    if (onChildSpawned) onChildSpawned(child)
  }
  restart()

  const restartSoon = debounce(restart, 500)
  const clearRequireCacheSoon = debounce(() => {
    child.send('CLEAR_REQUIRE_CACHE')
    log('cleared require cache')
  }, 500)

  function kill(signal = killSignal) {
    childRunning = false
    if (killTimeout != null) {
      clearTimeout(killTimeout)
      killTimeout = null
    }
    if (child) {
      child.removeAllListeners()
      child.kill(signal)
      child = null
    }
    if (watcher) {
      watcher.removeAllListeners()
      watcher.close()
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
