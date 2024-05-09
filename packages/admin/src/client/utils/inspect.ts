import {useSettings} from '../settings'
import {trpc} from './trpc'
import {PostgreSQLJson} from '@/packlets/autocomplete/suggest'

export const useInspectQuery = () => {
  const {data: healthy} = trpc.healthcheck.useQuery()
  const settings = useSettings()
  const query = trpc.inspect.useQuery(
    {
      includeSchemas: settings.includeSchemas,
      excludeSchemas: settings.excludeSchemas,
    },
    {enabled: Boolean(healthy?.ok)},
  )

  return query
}

export const useInspected = () => useInspectQuery().data?.inspected as {} as PostgreSQLJson

export const useSearchPath = () => useInspectQuery().data?.searchPath
