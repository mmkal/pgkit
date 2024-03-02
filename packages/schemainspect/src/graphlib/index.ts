/* eslint-disable mmkal/@typescript-eslint/no-dynamic-delete */
/* eslint-disable max-depth */
import {inspect} from 'node:util'

export class StopIteration extends Error {}

export class _NodeInfo<T = string> {
  node: T
  npredecessors: number
  successors: T[]

  constructor(node: T) {
    this.node = node
    this.npredecessors = 0
    this.successors = []
  }
}

export class CycleError extends Error {
  cycle: unknown
  constructor(message: string, cycle: unknown) {
    super(message)
    this.name = 'CycleError'
    this.cycle = cycle
  }
}

const _NODE_OUT = -1
const _NODE_DONE = -2

export class TopologicalSorter {
  _node2info: Record<string, _NodeInfo>
  _ready_nodes: string[] | null
  _npassedout: number
  _nfinished: number

  constructor(graph: Record<string, string[]>) {
    this._node2info = {}
    this._ready_nodes = null
    this._npassedout = 0
    this._nfinished = 0

    for (const [node, predecessors] of Object.entries(graph)) {
      this.add(node, ...predecessors)
    }
  }

  _get_nodeinfo(node: string): _NodeInfo {
    let result = this._node2info[node]

    if (result === undefined) {
      result = new _NodeInfo(node)
      this._node2info[node] = result
    }

    return result
  }

  add(node: string, ...predecessors: string[]): void {
    if (this._ready_nodes !== null) {
      throw new Error('Nodes cannot be added after a call to prepare()')
    }

    const nodeinfo = this._get_nodeinfo(node)
    nodeinfo.npredecessors += predecessors.length

    for (const pred of predecessors) {
      const pred_info = this._get_nodeinfo(pred)
      pred_info.successors.push(node)
    }
  }

  prepare(): void {
    if (this._ready_nodes) {
      throw new Error('cannot prepare() more than once')
    }

    this._ready_nodes = Object.values(this._node2info)
      .filter(i => i.npredecessors === 0)
      .map(i => i.node)

    const cycle = this._find_cycle()
    if (cycle) {
      throw new CycleError('nodes are in a cycle', cycle)
    }
  }

  get_ready() {
    if (!this._ready_nodes) {
      throw new Error('prepare() must be called first')
    }

    const result = [...this._ready_nodes]
    const n2i = this._node2info
    for (const node of result) {
      n2i[node].npredecessors = _NODE_OUT
    }

    this._ready_nodes = []
    this._npassedout += result.length

    return result
  }

  is_active(): boolean {
    if (!this._ready_nodes) {
      throw new Error('prepare() must be called first')
    }

    return this._nfinished < this._npassedout || this._ready_nodes.length > 0
  }

  done(...nodes: any[]): void {
    if (!this._ready_nodes) {
      throw new Error('prepare() must be called first')
    }

    const n2i = this._node2info

    for (const node of nodes) {
      const nodeinfo = n2i[node]
      if (nodeinfo === undefined) {
        throw new Error(`node ${node} was not added using add()`)
      }

      const stat = nodeinfo.npredecessors
      if (stat !== _NODE_OUT) {
        if (stat >= 0) {
          throw new Error(`node ${node} was not passed out (still not ready)`)
        } else if (stat === _NODE_DONE) {
          throw new Error(`node ${node} was already marked done`)
        } else {
          throw new Error(`node ${node}: unknown status ${stat}`)
        }
      }

      nodeinfo.npredecessors = _NODE_DONE

      for (const successor of nodeinfo.successors) {
        const successor_info = n2i[successor]
        successor_info.npredecessors -= 1
        if (successor_info.npredecessors === 0) {
          this._ready_nodes.push(successor)
        }
      }

      this._nfinished += 1
    }
  }

  _find_cycle() {
    const n2i = this._node2info
    const stack: string[] = []
    const itstack: Array<IterableIterator<string>> = []
    const seen = new Set<string>()
    const node2stacki: Record<string, number> = {}

    for (let node in n2i) {
      if (seen.has(node)) {
        continue
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (seen.has(node)) {
          if (node in node2stacki) {
            const val = node2stacki[node]
            return [...stack.slice(val), node]
          }
        } else {
          seen.add(node)
          if (!(node in n2i)) {
            throw new Error(`expected ${node} to be in ${inspect(n2i)}`)
          }

          const next = n2i[node].successors[Symbol.iterator]()
          itstack.push(next)
          node2stacki[node] = stack.length
          stack.push(node)
        }

        while (stack.length > 0) {
          try {
            node = itstack.at(-1).next().value
            if (!node) {
              delete node2stacki[stack.pop()]
              itstack.pop()
            }

            break
          } catch (error) {
            // eslint-disable-next-line max-depth
            if (error instanceof StopIteration) {
              delete node2stacki[stack.pop()]
              itstack.pop()
            }
          }
        }

        if (stack.length === 0) {
          break
        }
      }
    }

    return null
  }

  // eslint-disable-next-line generator-star-spacing
  *static_order(): IterableIterator<any> {
    this.prepare()
    while (this.is_active()) {
      const node_group = this.get_ready()

      for (const each of node_group) {
        yield each
      }

      this.done(...node_group)
    }
  }
}
