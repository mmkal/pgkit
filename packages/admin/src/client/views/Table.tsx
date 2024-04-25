/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
import React from 'react'
import {PostgreSQLJson} from '../../packlets/autocomplete/suggest'
import {SVGProps} from '../page'
import {ResultsViewer} from '../results/grid'
import {trpc} from '../utils/trpc'
import {Button} from '@/components/ui/button'
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
  const prevEnabled = offset > 0
  const values = rowsMutation.data?.results[0].result || []
  const nextEnabled = Boolean(limit) && values.length >= limit

  const query = React.useMemo(() => {
    if (identifier && inspected && identifier in inspected.tables) {
      const table = identifier
      const isSafe = table.match(/^[\w".]+$/)
      if (!isSafe) throw new Error('Unsafe table name: ' + table)
      return `select * from ${table} limit ${Number(limit)} offset ${Number(offset)}`
    }
    return null
  }, [identifier, inspected, limit, offset])

  React.useEffect(() => {
    if (query) {
      rowsMutation.mutate({query})
    }
  }, [query])

  const rows = rowsMutation.data?.results[0]?.result || []

  return (
    <div className="p-2 h-[95vh] relative gap-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-100 dark:text-gray-100">{identifier}</h3>
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

              {/* <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem> */}
              <PaginationItem>
                <PaginationNext disabled={!nextEnabled} onClick={() => setOffset(Number(offset) + Number(limit))} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
        <div className="flex items-center gap-2">
          <Button title="Filter" className="text-gray-100 dark:text-gray-100" size="sm" variant="outline">
            <FilterIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button>
          <Button title="Columns" className="text-gray-100 dark:text-gray-100" size="sm" variant="outline">
            <ColumnsIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button>
          <Button title="Add Row" className="text-gray-100 dark:text-gray-100" size="sm" variant="outline">
            <PlusIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button>
          {/* <Button title="Pagination" className="text-gray-100 dark:text-gray-100" size="sm" variant="outline">
            <NavigationIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button> */}
          <Button
            disabled={!query}
            onClick={() => query && rowsMutation.mutate({query})}
            title="Refresh"
            className="text-gray-100 dark:text-gray-100"
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button>
          <Button title="Download" className="text-gray-100 dark:text-gray-100" size="sm" variant="outline">
            <DownloadIcon className="w-4 h-4 text-gray-100 dark:text-gray-100" />
          </Button>
        </div>
      </div>
      <div className="relative h-[calc(100%-200px)] max-w-[100%] overlow-scroll border-white-1">
        <ResultsViewer offset={offset} values={rows} />
      </div>
    </div>
  )
}

function FilterIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function PlusIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

function RefreshCwIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  )
}

function ColumnsIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="12" x2="12" y1="3" y2="21" />
    </svg>
  )
}

function DownloadIcon(props: SVGProps) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}
