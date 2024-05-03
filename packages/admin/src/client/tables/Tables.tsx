/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import React from 'react'
import {useLocalStorage} from 'react-use'
import {PostgreSQLJson} from '../../packlets/autocomplete/suggest'
import {ResultsViewer} from '../results/grid'
import {trpc} from '../utils/trpc'

export interface TablesProps {
  inspected: PostgreSQLJson
}

export const Tables = ({inspected}: TablesProps) => {
  const [table, setTable] = useLocalStorage('table.name.0.0.1', '')
  const [limit, _setLimit] = useLocalStorage('table.limit.0.0.1', 100)
  const [offset, setOffset] = useLocalStorage('table.offset.0.0.1', 0)
  const rowsMutation = trpc.executeSql.useMutation()
  const prevEnabled = offset! > 0
  const values = rowsMutation.data?.results[0].result || []
  const nextEnabled = Boolean(limit) && values.length >= limit!

  React.useEffect(() => {
    if (table && inspected.tables && table in inspected.tables) {
      const isSafe = table.match(/^[\w".]+$/)
      if (!isSafe) throw new Error('Unsafe table name: ' + table)
      rowsMutation.mutate({
        query: `select * from ${table} limit ${Number(limit)} offset ${Number(offset)}`,
      })
    }
  }, [table, inspected, limit, offset])

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10}}>
      <div>
        {Object.entries(inspected.tables || {}).map(([name, info]) => (
          <button key={name} disabled={name === table} onClick={() => setTable(name)}>
            {info.name}
          </button>
        ))}
      </div>
      <ResultsViewer
        offset={offset}
        values={rowsMutation.data?.results[0]?.result || []}
        columnNames={rowsMutation.data?.results[0]?.fields?.map(f => f.name)}
      />
      <div style={{display: 'flex', gap: 5, alignItems: 'center'}}>
        <button
          onClick={() => setOffset(Number(offset) - Number(limit))}
          disabled={!prevEnabled}
          aria-label="previous page"
        >
          ⬅️
        </button>
        <span>
          {Number(offset) + 1} - {Number(offset) + Number(Math.min(limit!, values.length))}
        </span>
        <button
          disabled={!nextEnabled}
          onClick={() => setOffset(Number(offset) + Number(limit))}
          aria-label="next page" //
        >
          ➡️
        </button>
      </div>
    </div>
  )
}
