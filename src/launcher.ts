'use strict'

import path from 'path'
import createDebug from 'debug'
import * as module from 'module'
import { type LaunchOptions } from '.'
const debug = createDebug('smart-restart:launcher')

export type MessageFromChild = {
  file?: string
  parent?: string
  err?: string
  status?: 'ready'
}

// @ts-expect-error yeah, this exists...
const natives = process.binding('natives')

const deleteRequireCache: { [key in string]?: boolean } = {}

function sendMessage(message: MessageFromChild) {
  debug('sending message: ', message)
  process.send?.(message)
}

process.on('message', (options: 'CLEAR_REQUIRE_CACHE' | LaunchOptions) => {
  debug('message received')
  if (options === 'CLEAR_REQUIRE_CACHE') {
    for (const key in deleteRequireCache) {
      if (deleteRequireCache[key]) delete require.cache[key]
    }
    return
  }
  const origDeleteRequireCache = new Set(options.deleteRequireCache)
  options.deleteRequireCache?.forEach((m) => (deleteRequireCache[m] = true))
  const main = path.resolve(options.main)
  // @ts-expect-error not typed
  const _load_orig = module._load
  // @ts-expect-error not typed
  module._load = function (
    name: string,
    parent: { id: string },
    isMain: boolean
  ) {
    // @ts-expect-error not typed
    const file = module._resolveFilename(name, parent)
    if (
      parent &&
      (options.includeModules || file.indexOf('node_modules') < 0) &&
      !natives[file] &&
      file !== main
    ) {
      if (!origDeleteRequireCache.has(file)) {
        deleteRequireCache[file] = deleteRequireCache[parent.id] || false
      }
      sendMessage({
        file,
        parent: parent.id,
      })
    } else {
      debug('ignoring module: ', name)
    }
    return _load_orig(name, parent, isMain)
  }
  require(main)
})
sendMessage({ status: 'ready' })
function handleError(err: any) {
  sendMessage({
    err: (err != null ? err.stack : void 0) || err,
  })
}

process.on('uncaughtException', handleError)
process.on('unhandledRejection', handleError)
