#!/usr/bin/env node

/* eslint-disable no-console */
import chalk from 'chalk'
import path from 'path'
import { ChildProcess, SpawnOptions, spawn } from 'child_process'
import chokidar, { FSWatcher } from 'chokidar'
import createDebugger from 'debug'
const debug = createDebugger('smart-restart:supervisor')
import { debounce } from 'lodash'
import { SignalConstants } from 'os'
import { MessageFromChild } from './launcher'

function log(...args: any[]) {
  console.log(chalk.bold.red('[smart-restart]'), ...args)
}

export interface LaunchOptions {
  main: string
  command?: string
  commandOptions?: ReadonlyArray<string>
  args?: ReadonlyArray<string>
  spawnOptions?: SpawnOptions
  onChildSpawned?: (child: ChildProcess) => void
  ignore?: RegExp
  usePolling?: boolean
  interval?: number
  binaryInterval?: number
  includeModules?: boolean
  killSignal?: number | keyof SignalConstants
  killTimeout?: number
  deleteRequireCache?: ReadonlyArray<string>
  restartOnError?: boolean
  restartOnExit?: boolean
}

function launch(ops: LaunchOptions) {
  let lastErr = ''
  let child: ChildProcess | undefined
  let watcher: FSWatcher
  let childRunning = false
  let killTimeout: NodeJS.Timeout | null = null

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
  options.deleteRequireCache.forEach((m) => (deleteRequireCache[m] = true))
  process.on('exit', () => child && child.kill())

  function done(codeOrError?: number | Error, signal?: string) {
    if (codeOrError instanceof Error) {
      log('child process error:', codeOrError.message)
    } else if (typeof codeOrError === 'number') {
      log('process exited with code', codeOrError)
    } else if (signal != null) {
      log('process was killed with', signal)
    }

    childRunning = false
    if (typeof codeOrError !== 'number' || options.restartOnExit) restart()
  }

  function restart() {
    if (childRunning) {
      if (killTimeout == null) {
        log('killing process with', killSignal)
        child?.kill(killSignal)
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
    watcher.on('change', function (file) {
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
    ] as const

    log('spawning process')
    child = spawn(...args)
    childRunning = true

    child.on('exit', done)
    child.on('error', done)

    debug('spawned child pid: ', child.pid)
    child.on('message', (message: MessageFromChild) => {
      debug('message received')
      const { status, file, parent, err } = message
      if (status === 'ready') {
        debug('sending message:', options)
        child?.send(options, (error) => {
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
        if (!parent) {
          throw new Error(
            `message.parent should be defined when message.file is defined`
          )
        }
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
    child?.send('CLEAR_REQUIRE_CACHE')
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
      child = undefined
    }
    if (watcher) {
      watcher.removeAllListeners()
      watcher
        .close()
        .catch((err) => console.error('Error closing file watcher:', err.stack))
    }
  }

  return {
    restart,
    kill,
  }
}

module.exports = launch
launch.default = launch

if (!module.parent) {
  const mainIndex = process.argv.findIndex((arg, i) => i > 1 && arg[0] !== '-')
  const main = process.argv[mainIndex]
  const commandOptions = process.argv.slice(3, mainIndex)
  const args = process.argv.slice(mainIndex + 1)
  launch({
    main,
    commandOptions,
    args,
  })
}
