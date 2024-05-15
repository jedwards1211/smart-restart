export type HotReloadCallback = () => void

class Module {
  children: Set<Module> = new Set()
  parents: Set<Module> = new Set()
  hotReloadCallbacks: Map<string, HotReloadCallback[]> = new Map()

  constructor(public id: string) {}

  addHotReloadCallback(id: string, callback: HotReloadCallback) {
    let callbacks = this.hotReloadCallbacks.get(id)
    if (!callbacks) this.hotReloadCallbacks.set(id, (callbacks = []))
    callbacks.push(callback)
  }
}

export default class ModuleGraph {
  modules: Map<string, Module> = new Map()

  get(id: string): Module | undefined {
    return this.modules.get(id)
  }

  getOrCreate(id: string): Module {
    let mod = this.modules.get(id)
    if (mod) return mod
    this.modules.set(id, (mod = new Module(id)))
    return mod
  }

  register(id: string, parentId: string) {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`invalid id: ${id}`)
    }
    if (typeof parentId !== 'string' || !parentId.trim()) {
      throw new Error(`invalid parentId: ${parentId}`)
    }
    const mod = this.getOrCreate(id)
    if (parentId !== id) {
      const parent = this.getOrCreate(parentId)
      mod.parents.add(parent)
      parent.children.add(mod)
    }
  }

  delete(ids: Iterable<string>) {
    for (const id of ids) {
      const mod = this.modules.get(id)
      if (!mod) continue
      for (const child of mod.children) child.parents.delete(mod)
      for (const parent of mod.parents) parent.children.delete(mod)
      mod.children.clear()
      mod.parents.clear()
      mod.hotReloadCallbacks.clear()
      this.modules.delete(id)
    }
  }

  addHotReloadCallback(
    id: string,
    parentId: string,
    callback: HotReloadCallback
  ) {
    const parent = this.getOrCreate(parentId)
    parent.addHotReloadCallback(id, callback)
  }

  invalidate(ids: Iterable<string>): {
    restart: boolean
    reloadIds: Set<string>
    unloadIds: Set<string>
    callbacks: HotReloadCallback[]
  } {
    let restart = false
    const reloadIds: Set<string> = new Set()
    const unloadIds: Set<string> = new Set()
    const callbacks: Set<HotReloadCallback> = new Set()
    const queue: Module[] = []
    for (const id of ids) {
      const mod = this.modules.get(id)
      if (mod) queue.push(mod)
    }

    while (queue.length) {
      const mod = queue.pop()
      if (!mod || unloadIds.has(mod.id)) continue
      unloadIds.add(mod.id)
      if (!mod.parents.size) restart = true
      for (const parent of mod.parents) {
        const hotReloadCallbacks = parent.hotReloadCallbacks.get(mod.id)
        if (hotReloadCallbacks?.length) {
          reloadIds.add(mod.id)
          for (const callback of hotReloadCallbacks) callbacks.add(callback)
        } else {
          queue.push(parent)
        }
      }
    }

    if (restart)
      return {
        restart,
        reloadIds: new Set(),
        unloadIds: new Set(),
        callbacks: [],
      }
    return { restart, reloadIds, unloadIds, callbacks: [...callbacks] }
  }
}
