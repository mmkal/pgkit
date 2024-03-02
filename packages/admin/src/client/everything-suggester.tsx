// @ts-expect-error just js
import everythingJson from '@pgkit/migra/test/__snapshots__/everything.json.mjs'

import React, {lazy, Suspense} from 'react'
import {PostgreSQLJson} from '../packlets/autocomplete/suggest'

const AutoSQLEditor = lazy(async () => {
  const module = await import('../packlets/autocomplete/monaco')

  return {default: module.AutoSQLEditor}
})
const MemoizedAutoSQLEditor = React.memo(AutoSQLEditor)

export const EverythingSuggester = (params: Omit<Parameters<typeof AutoSQLEditor>[0], 'schema'>) => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MemoizedAutoSQLEditor schema={everythingJson as {} as PostgreSQLJson} {...params} />
    </Suspense>
  )
}
