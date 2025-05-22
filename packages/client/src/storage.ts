import {AsyncLocalStorage} from 'async_hooks'
import {Queryable} from './types'

/**
 * @experimental
 * A holder for the client and other pgkit config. Can be used to provide a client (or other queryable).
 * Other libraries may be able to add more config here in the future.
 *
 * Note: this is only used for `` await sql`select 1` `` use-cases right now.
 */
export const pgkitStorage = new AsyncLocalStorage<{client?: Queryable}>()
