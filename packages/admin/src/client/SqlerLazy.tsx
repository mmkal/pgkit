import React, {lazy, Suspense} from 'react'
import {type AutoSQLEditorParams} from '../packlets/autocomplete/monaco'
import {trpc} from './trpc'

const AutoSQLEditor = lazy(async () => {
  const module = await import('../packlets/autocomplete/monaco')

  return {default: module.AutoSQLEditor}
})
const MemoizedAutoSQLEditor = React.memo(AutoSQLEditor)

export const SqlerLazy = (params: AutoSQLEditorParams) => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MemoizedAutoSQLEditor {...params} />
    </Suspense>
  )
}

export const SqlerFromConnectionString = (params: Omit<AutoSQLEditorParams, 'schema'> & {connectionString: string}) => {
  const query = trpc.inspectSchema.useQuery(params)
  if (!query.data) {
    return <pre>{JSON.stringify(query.error || query.status, null, 2)}</pre>
  }

  // return <pre>{JSON.stringify(query, null, 2)}</pre>

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MemoizedAutoSQLEditor schema={query.data.schema} onChange={params.onChange} />
    </Suspense>
  )
}
