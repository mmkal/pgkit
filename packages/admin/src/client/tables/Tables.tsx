/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import React from 'react'
import {useLocalStorage} from 'react-use'
import {PostgreSQLJson} from '../../packlets/autocomplete/suggest'
import {ResultsViewer} from '../results/grid'
import {trpc} from '../trpc'

export interface TablesProps {
  inspected: PostgreSQLJson
}

export const Tables = ({inspected}: TablesProps) => {
  const [table, setTable] = useLocalStorage('table.name.0.0.1', '')
  const [limit, _setLimit] = useLocalStorage('table.limit.0.0.1', 100)
  const [offset, setOffset] = useLocalStorage('table.offset.0.0.1', 0)
  const rowsMutation = trpc.executeSql.useMutation()

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
    <>
      <div>
        {Object.entries(inspected.tables || {}).map(([name, info]) => (
          <button key={name} disabled={name === table} onClick={() => setTable(name)}>
            {info.name}
          </button>
        ))}
      </div>
      <button
        onClick={() => setOffset(Number(offset) - Number(limit))}
        disabled={offset === 0}
        aria-label="previous page"
      >
        ⬅️
      </button>
      <button
        disabled={!(rowsMutation.data?.results.length! < limit!)}
        onClick={() => setOffset(Number(offset) + Number(limit))}
        aria-label="next page"
      >
        ➡️
      </button>
      {<ResultsViewer values={rowsMutation.data?.results[0]?.result || []} />}
    </>
  )
}
