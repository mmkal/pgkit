/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'react-json-view-lite/dist/index.css'

import {deepEqual, strictEqual} from 'assert'
import mermaid from 'mermaid'
import {useEffect, useMemo} from 'react'
import * as jsonView from 'react-json-view-lite'
import {useInspected, useSearchPath} from '../utils/inspect'

/** Sample
flowchart LR
  subgraph messages
    messages.authorId[authorId: id 'users']
  end
  subgraph users
    users.name[name: string]
    users.age[age: number]
    users.teamId[teamId: id 'teams']
  end
  subgraph teams
    teams.name[name: string]
  end
  messages.authorId-->users
  users.teamId-->teams

 */

export const Inspector = () => {
  useEffect(() => mermaid.initialize({startOnLoad: true, theme: 'dark'}), [])

  const inspected = useInspected()
  const searchPath = useSearchPath()

  const mermaidText = useMemo(() => {
    const flowchartLR = {} as any
    if (!inspected?.tables) return ''
    Object.entries(inspected.tables).forEach(([_tableName, table]) => {
      const subnode = (flowchartLR[`subgraph ${table.name}`] = {} as any)
      Object.entries(table.columns).forEach(([columnName, column]) => {
        subnode[`${table.name}.${columnName}[${columnName}: ${column.dbtype}]`] = 0
      })
    })

    const lines: string[] = []
    const addNode = (node: any, indent: number) => {
      if (indent > 10) throw new Error('indent too deep')
      Object.entries(node as {}).forEach(([key, value]) => {
        if (value) {
          lines.push(`${' '.repeat(indent)}${key}`)
          addNode(value, indent + 1)
          if (indent > 0) lines.push(`${' '.repeat(indent)}end`)
        } else {
          lines.push(`${' '.repeat(indent)}${key}`)
        }
      })
    }

    Object.entries(inspected.constraints).forEach(([_constraintName, constraint]) => {
      const m = constraint.definition.match(/^FOREIGN KEY \((.*?)\) REFERENCES (.*)\((.*?)\)$/)
      if (!m) return

      const [_, column, refTable, refColumn] = m

      flowchartLR[`${constraint.table_name}.${column}-->${refTable}.${refColumn}`] = 0
    })

    // flowchartLR['ttzt.foo_id-->foo.id'] = 0

    const root = {'flowchart LR': flowchartLR} as any
    addNode(root, 0)

    // if (Math.random()) return void console.log('cccd')
    return '\n' + lines.join('\n') + '\n'
  }, [inspected])

  useEffect(() => void setTimeout(() => mermaid.contentLoaded(), 1000), [mermaidText])

  return (
    <div className="h-full overflow-auto flex flex-col gap-1">
      {mermaidText && (
        <pre key={mermaidText.length} className="mermaid">
          {mermaidText}
        </pre>
      )}
      <div>
        Search path: <pre className="inline">{searchPath}</pre>
      </div>
      <jsonView.JsonView
        data={inspected} //
        shouldExpandNode={jsonView.collapseAllNested}
        style={jsonView.darkStyles}
      />
      {/* <pre>{JSON.stringify(inspected, null, 2)}</pre> */}
    </div>
  )
}
