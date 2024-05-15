import chalk from 'chalk'
import path from 'path'
import Module from 'module'
import ModuleGraph, { HotReloadCallback } from './ModuleGraph'
import debounce from 'lodash/debounce'
import { sendMessageToParent } from './launcher'

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.error(chalk.bold.red('[smart-restart]'), ...args)
}

const moduleGraph = new ModuleGraph()

// @ts-expect-error can't seem to declaration merge this in
if (Module.prototype.hot) {
  log('Something else has already monkeypatched module.hot!')
} else {
  Object.defineProperties(Module.prototype, {
    hot: {
      get(this: Module) {
        return {
          accept: (
            requests: string | string[],
            callback: HotReloadCallback
          ) => {
            for (const request of Array.isArray(requests)
              ? requests
              : [requests]) {
              // @ts-expect-error not typed
              const targetId = Module._resolveFilename(request, this)
              moduleGraph.addHotReloadCallback(targetId, this.id, callback)
            }
          },
        }
      },
    },
  })
}

export function registerModuleParent(moduleName: string, parentName: string) {
  moduleGraph.register(moduleName, parentName)
}

const invalidateQueue: string[] = []

export function invalidate(moduleName: string) {
  invalidateQueue.push(moduleName)
  invalidateSoon()
}

const invalidateSoon = debounce(() => {
  if (!invalidateQueue.length) return
  const moduleNames = [...invalidateQueue]
  invalidateQueue.length = 0
  const { restart, reloadIds, unloadIds, callbacks } =
    moduleGraph.invalidate(moduleNames)
  if (restart) {
    sendMessageToParent({ restart: true })
  } else {
    log(
      `hot reloading modules:${[...reloadIds]
        .map((id) => `\n  - ${path.relative(process.cwd(), id)}`)
        .join('')}`
    )
    for (const id of unloadIds) delete require.cache[id]
    moduleGraph.delete(unloadIds)
    for (const callback of callbacks) callback()
    log(`hot reload complete`)
  }
}, 100)
