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
  console.error(chalk.bold.red('[smart-restart]'), ...args)
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

export type MessageForChild =
  | { type: 'launch'; options: LaunchOptions }
  | { type: 'clearRequireCache' }
  | { type: 'fileChange'; file: string }

function launch(ops: LaunchOptions) {
  let lastErr = ''
  let child: ChildProcess | undefined
  let restartTimeout: NodeJS.Timeout | undefined
  let watcher: FSWatcher

  const options = {
    includeModules: false,
    ignore: /(\/\.|~$)/,
    restartOnError: true,
    restartOnExit: true,
    killSignal: 'SIGINT' as const,
    command: process.argv[0],
    commandOptions: [],
    spawnOptions: {},
    deleteRequireCache: [],
    args: [],
    ...ops,
  }
  const { killSignal, onChildSpawned } = options
  if (!options.main) throw new Error('missing main')
  const initial = path.resolve(options.main)

  const origDeleteRequireCache = new Set(options.deleteRequireCache)

  const deleteRequireCache = {
    [initial]: false,
  }
  options.deleteRequireCache.forEach((m) => (deleteRequireCache[m] = true))

  let userKilled = false

  function signalHandler(signal: string) {
    if (userKilled) {
      log(`got second ${signal}, killing child process with SIGKILL`)
      kill('SIGKILL')
      process.exit()
    } else {
      log(`got ${signal}, killing child process with ${options.killSignal}`)
      userKilled = true
      kill()
    }
  }

  process.on('SIGINT', signalHandler)
  process.on('SIGTERM', signalHandler)
  process.on('exit', () => kill('SIGKILL'))

  function done(codeOrError?: number | Error, signal?: string) {
    if (restartTimeout) {
      clearTimeout(restartTimeout)
      restartTimeout = undefined
    }
    child?.removeAllListeners()
    child = undefined
    if (codeOrError instanceof Error) {
      log('child process error:', codeOrError)
    } else if (typeof codeOrError === 'number') {
      log('child process exited with code', codeOrError)
    } else if (signal != null) {
      log('child process was killed with', signal)
    }
    if (userKilled) {
      process.exit()
      return
    }

    if (typeof codeOrError !== 'number' || options.restartOnExit) restart()
  }

  function kill(signal = killSignal) {
    child?.kill(signal)
    watcher
      .close()
      .catch((err) => log('error closing file watcher:', err.stack))
  }

  function sendToChild(message: MessageForChild) {
    child?.send(message, (err) => {
      if (err) {
        log('failed to send message to child process', err)
      }
    })
  }

  function restart() {
    if (child) {
      if (restartTimeout) return
      kill()
      const currentChild = child
      restartTimeout = setTimeout(() => {
        if (child === currentChild) {
          kill('SIGKILL')
          start()
        }
      }, ops.killTimeout || 10000)
      return
    }
    kill('SIGKILL')
    start()
  }

  function start() {
    watcher = chokidar.watch(initial, {
      ignored: options.ignore,
      ignoreInitial: false,
      usePolling: options.usePolling,
      interval: options.interval || 100,
      binaryInterval: options.binaryInterval || 300,
    })
    watcher.on('change', function (file) {
      log('file has changed:', path.relative(process.cwd(), file))
      if (deleteRequireCache[file]) clearRequireCacheSoon()
      else {
        sendToChild({ type: 'fileChange', file })
      }
    })
    watcher.on('error', (error) => log('error from file watcher:', error))

    const args = [
      options.command,
      [
        ...options.commandOptions,
        path.resolve(__dirname, `launcher${path.extname(__filename)}`),
        ...options.args,
      ],
      { ...options.spawnOptions, stdio: [0, 1, 2, 'ipc'] },
    ] satisfies Parameters<typeof spawn>

    log('spawning child process')
    child = spawn(...args)

    child.on('close', done)
    child.on('error', done)

    debug('spawned child pid: ', child.pid)
    child.on('message', (message: MessageFromChild) => {
      debug('message received', message)
      const { status, file, parent, err, restart: childSaysRestart } = message
      if (childSaysRestart) {
        restart()
        return
      }
      if (status === 'ready') {
        debug('sending message:', options)
        sendToChild({ type: 'launch', options })
        return
      }
      if (err && (options.restartOnError || err !== lastErr)) {
        lastErr = err
        if (!options.restartOnError) {
          log('further repeats of this error will be suppressed...')
        }
        restart()
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
  start()

  const clearRequireCacheSoon = debounce(() => {
    sendToChild({ type: 'clearRequireCache' })
    log('cleared require cache')
  }, 500)

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
