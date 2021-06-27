import * as lodash from 'lodash'
import {AnalysedQuery, TaggedQuery} from '../types'

/**
 * Find a tag (interface) name for each query. This is based on the "suggested tags" which are calculated from the tables
 * and columns referenced in the query. e.g. `select id, content from message` will have suggested tags
 * `['Message', 'Message_id_content']`. If multiple queries share the same type, they can use the same tag. If they have
 * different types they will get different tags, going through the suggestions and using `_0`, `_1` to disambiguate as a
 * last resort.
 */
export function addTags(queries: AnalysedQuery[]): TaggedQuery[] {
  const withIdentifiers = queries.map(q => ({
    ...q,
    identifier: JSON.stringify(q.fields),
  }))

  const tagMap = lodash
    .chain(withIdentifiers)
    .flatMap(q =>
      q.suggestedTags.map((tag, _i, allTags) => ({
        ...q,
        tag,
        alternatives: allTags,
      })),
    )
    .sortBy(q => q.alternatives.length)
    .map((q, i, arr) => {
      const firstWithTagIndex = lodash.findIndex(arr, o => o.tag === q.tag)
      const matchesFirstTag = arr[firstWithTagIndex].identifier === q.identifier
      return {
        ...q,
        tag: matchesFirstTag ? q.tag : q.tag + '_' + firstWithTagIndex,
        priority: matchesFirstTag ? 0 : 1,
      }
    })
    .sortBy(q => q.priority)
    .uniqBy(q => q.identifier)
    .keyBy(q => q.identifier)
    .value()

  return withIdentifiers.map(q => ({
    ...q,
    tag: tagMap[q.identifier].tag + (q.parameters.length ? `_${q.parameters.length}` : ''),
  }))
}
