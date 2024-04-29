/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import React from 'react'
import {z} from 'zod'
import {PostgreSQLJson} from '../../packlets/autocomplete/suggest'
import {ResultsViewer} from '../results/grid'
import {trpc} from '../utils/trpc'
import {PopoverZFormButton} from '../utils/zform'
import {Button} from '@/components/ui/button'
import {icons} from '@/components/ui/icons'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

export interface TablesProps {
  inspected: PostgreSQLJson
}

export const Table = ({identifier}: {identifier: string}) => {
  const [limit, _setLimit] = React.useState(100)
  const [offset, setOffset] = React.useState(0)
  const {data: {inspected} = {}} = trpc.inspect.useQuery({})
  const rowsMutation = trpc.executeSql.useMutation()
  const addMutation = trpc.executeSql.useMutation()
  const prevEnabled = offset > 0
  const values = rowsMutation.data?.results[0].result || []
  const nextEnabled = Boolean(limit) && values.length >= limit

  const columnNames = Object.values(inspected?.tables[identifier]?.columns || {}).map(c => c.name)
  const [whereClause, setWhereClause] = React.useState('')
  const [columns, setColumns] = React.useState<string[]>(['*'])

  const query = React.useMemo(() => {
    if (identifier && inspected && identifier in inspected.tables) {
      const table = identifier
      for (const name of [table, ...columns]) {
        const isSafe = name.match(/^[\w"*.]+$/)
        if (!isSafe)
          return `
            select 'invalid column or table name' as error,
            'only word characters, double quotes, and asterisks are allowed' as hint,
            'for advanced queries, use the SQL Editor tab' as suggestion
          `
      }

      // todo: figure out who to get column information without this dummy row of nulls thing
      return `
        with
          counts as (select count(1) from ${table}),
          dummy as (select 1 from counts where count = 0)
        select ${columns.map(c => `t.${c}`).join(', ')} from ${table} t
        full outer join dummy on true
        ${whereClause ? `where ${whereClause}` : ''}
        limit ${Number(limit)}
        offset ${Number(offset)}
      `
    }
    return null
  }, [identifier, inspected, limit, offset, whereClause, columns])

  React.useEffect(() => {
    if (query) {
      rowsMutation.mutate({query})
    }
  }, [query])

  const rows = rowsMutation.data?.results[0]?.result || []

  return (
    <div className="p-2 h-[95vh] relative gap-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold ">{identifier}</h3>
        <div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious onClick={() => setOffset(Number(offset) - Number(limit))} disabled={!prevEnabled} />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink>
                  {Number(offset) + 1} - {Number(offset) + Number(Math.min(limit, values.length))}
                </PaginationLink>
              </PaginationItem>

              <PaginationItem className="hidden">
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext disabled={!nextEnabled} onClick={() => setOffset(Number(offset) + Number(limit))} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
        <div className="flex items-center gap-2">
          <PopoverZFormButton
            schema={z.object({whereClause: z.string()})}
            onSubmit={data => setWhereClause(data.whereClause)}
            title="Filter"
            size="sm"
          >
            <icons.Filter className="w-4 h-4" />
          </PopoverZFormButton>
          <PopoverZFormButton
            schema={z.object({
              columns: z.array(z.enum(columnNames as [string])),
            })}
            onSubmit={data => setColumns(data.columns)}
            title="Columns"
            size="sm"
          >
            <icons.Columns3 className="w-4 h-4" />
          </PopoverZFormButton>
          <PopoverZFormButton
            schema={z.object(Object.fromEntries(columnNames.map(c => [c, z.string().optional()])))}
            onSubmit={data =>
              addMutation.mutate({
                query: `insert into ${identifier} (${Object.keys(data).join(', ')}) values (${Object.values(data).join(', ')})`,
              })
            }
            title="Columns"
            size="sm"
          >
            <icons.PlusCircle className="w-4 h-4" />
          </PopoverZFormButton>
          <Button
            disabled={!query}
            onClick={() => query && rowsMutation.mutate({query})}
            title="Refresh"
            className=""
            size="sm"
          >
            <icons.RefreshCcw className="w-4 h-4" />
          </Button>
          <Button title="Download" className="" size="sm">
            <icons.Download className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="relative h-[calc(100%-200px)] max-w-[100%] overlow-scroll border-white-1">
        <ResultsViewer offset={offset} values={rows} />
      </div>
    </div>
  )
}
