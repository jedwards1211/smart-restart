import { describe, it } from 'mocha'
import { expect } from 'chai'
import ModuleGraph from '../src/ModuleGraph'

describe(`ModuleGraph`, function () {
  it(`.register() and .delete()`, function () {
    const graph = new ModuleGraph()
    graph.register('child1', 'parent1')
    graph.register('child1', 'parent2')
    graph.register('child2', 'parent2')
    expect(graph.get('child1')?.id).to.equal('child1')
    expect(graph.get('child2')?.id).to.equal('child2')
    expect([...graph.get('child1')!.parents].map((p) => p.id)).to.deep.equal([
      'parent1',
      'parent2',
    ])
    expect([...graph.get('child2')!.parents].map((p) => p.id)).to.deep.equal([
      'parent2',
    ])

    expect([...graph.get('parent1')!.children].map((c) => c.id)).to.deep.equal([
      'child1',
    ])
    expect([...graph.get('parent2')!.children].map((c) => c.id)).to.deep.equal([
      'child1',
      'child2',
    ])
    graph.delete(['parent1'])

    expect(graph.get('parent1')).to.equal(undefined)
    expect([...graph.get('child1')!.parents].map((p) => p.id)).to.deep.equal([
      'parent2',
    ])
    expect([...graph.get('child2')!.parents].map((p) => p.id)).to.deep.equal([
      'parent2',
    ])
    expect([...graph.get('parent2')!.children].map((c) => c.id)).to.deep.equal([
      'child1',
      'child2',
    ])

    graph.delete(['parent2'])

    expect([...graph.get('child1')!.parents].map((p) => p.id)).to.deep.equal([])
    expect([...graph.get('child2')!.parents].map((p) => p.id)).to.deep.equal([])
  })

  it(`.invalidate()`, function () {
    /**
     *            A
     *           * *
     *          E   C
     *         * \   \
     *        I   J   D
     *         \ / \ /
     *      F   H   K
     *       \ /
     *        G
     */
    const graph = new ModuleGraph()
    for (const [child, parents] of [
      ['G', ['F', 'H']],
      ['H', ['I', 'J']],
      ['I', ['E']],
      ['J', ['E']],
      ['K', ['J', 'D']],
      ['E', ['A']],
      ['D', ['C']],
      ['C', ['A']],
    ] as [string, string[]][]) {
      for (const parent of parents) graph.register(child, parent)
    }

    for (const mod of ['A', 'F', 'G']) {
      expect(graph.invalidate([mod])).to.deep.equal({
        restart: true,
        reloadIds: new Set(),
        unloadIds: new Set(),
        callbacks: [],
      })
      expect(graph.invalidate([mod, 'H'])).to.deep.equal({
        restart: true,
        reloadIds: new Set(),
        unloadIds: new Set(),
        callbacks: [],
      })
    }
    function reloadC() {}
    function reloadE() {}
    function reloadI() {}
    graph.getOrCreate('E').hotReloadCallbacks.set('I', [reloadI])
    graph.getOrCreate('A').hotReloadCallbacks.set('E', [reloadE])
    graph.getOrCreate('A').hotReloadCallbacks.set('C', [reloadC])
    expect(graph.invalidate(['H', 'K'])).to.deep.equal({
      restart: false,
      reloadIds: new Set(['C', 'E', 'I']),
      unloadIds: new Set(['H', 'I', 'J', 'K', 'D', 'C', 'E']),
      callbacks: [reloadC, reloadE, reloadI],
    })
    expect(graph.invalidate(['K'])).to.deep.equal({
      restart: false,
      reloadIds: new Set(['C', 'E']),
      unloadIds: new Set(['J', 'K', 'D', 'C', 'E']),
      callbacks: [reloadC, reloadE],
    })
    expect(graph.invalidate(['D'])).to.deep.equal({
      restart: false,
      reloadIds: new Set(['C']),
      unloadIds: new Set(['D', 'C']),
      callbacks: [reloadC],
    })
    expect(graph.invalidate(['J'])).to.deep.equal({
      restart: false,
      reloadIds: new Set(['E']),
      unloadIds: new Set(['J', 'E']),
      callbacks: [reloadE],
    })
    expect(graph.invalidate(['I'])).to.deep.equal({
      restart: false,
      reloadIds: new Set(['I']),
      unloadIds: new Set(['I']),
      callbacks: [reloadI],
    })
  })
})
