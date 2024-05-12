'use strict'

import path from 'path'
import createDebug from 'debug'
import chalk from 'chalk'
import util from 'util'
import Module = require('module')
import { MessageForChild } from '.'
import { invalidate, registerModuleParent } from './hotModuleReplacement'

const debug = createDebug('smart-restart:launcher')

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.error(chalk.bold.red('[smart-restart]'), ...args)
}

export type MessageFromChild = {
  restart?: boolean
  file?: string
  parent?: string
  err?: string
  status?: 'ready'
}

// @ts-expect-error yeah, this exists...
const natives = process.binding('natives')

const deleteRequireCache: { [key in string]?: boolean } = {}

export function sendMessageToParent(message: MessageFromChild) {
  debug('sending message: ', message)
  process.send?.(message)
}

process.on('message', (message: MessageForChild) => {
  debug('message received', message)
  switch (message.type) {
    case 'clearRequireCache': {
      for (const key in deleteRequireCache) {
        if (deleteRequireCache[key]) delete require.cache[key]
      }
      return
    }
    case 'fileChange': {
      invalidate(message.file)
      return
    }
    case 'launch': {
      const { options } = message
      const origDeleteRequireCache = new Set(options.deleteRequireCache)
      options.deleteRequireCache?.forEach((m) => (deleteRequireCache[m] = true))
      const main = path.resolve(options.main)
      // @ts-expect-error not typed
      const _load_orig = Module._load
      // @ts-expect-error not typed
      Module._load = function (
        name: string,
        parent: { id: string },
        isMain: boolean
      ) {
        // @ts-expect-error not typed
        const file = Module._resolveFilename(name, parent)
        registerModuleParent(file, parent.id)
        if (
          parent &&
          (options.includeModules || file.indexOf('node_modules') < 0) &&
          !natives[file] &&
          file !== main
        ) {
          if (!origDeleteRequireCache.has(file)) {
            deleteRequireCache[file] = deleteRequireCache[parent.id] || false
          }
          sendMessageToParent({
            file,
            parent: parent.id,
          })
        } else {
          debug('ignoring module: ', name)
        }
        return _load_orig(name, parent, isMain)
      }
      require(main)
    }
  }
})
sendMessageToParent({ status: 'ready' })

process.on('uncaughtException', (err: any) => {
  log('uncaught exception in child process:', err)
  sendMessageToParent({ err: util.inspect(err) })
})
process.on('unhandledRejection', (err: any) => {
  log('unhandled rejection in child process:', err)
  sendMessageToParent({ err: util.inspect(err) })
})
