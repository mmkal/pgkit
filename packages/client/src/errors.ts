import {inspect} from 'node:util'
import {prettifyStandardSchemaError, StandardSchemaV1Error} from './standard-schema/errors'
import {looksLikeStandardSchemaFailure} from './standard-schema/utils'
import type {SQLQuery} from './types'

// only used by eslint to generate error codes, but I guess you could use it too
export const fetchErrorCodes: import('eslint-plugin-codegen').Preset<{}> = ({meta, dependencies: {child_process}}) => {
  const lastFetched = meta?.existingContent.split(/\r?\n/).find(line => /^\/\/ last fetched: (.*)$/.exec(line))
  const MILLIS_PER_YEAR = 1000 * 60 * 60 * 24 * 365
  const isStale = !lastFetched || Date.now() - new Date(lastFetched).getTime() > MILLIS_PER_YEAR
  if (isStale) {
    const docsUrl = 'https://www.postgresql.org/docs/current/errcodes-appendix.html'
    const docs = child_process.execSync(`curl ${docsUrl}`).toString()

    const trs = docs.split('<tr>').flatMap(tr => {
      const literal = /<code class="literal">(\w+)<\/code>/.exec(tr)?.[1]
      const symbol = /<code class="symbol">(\w+)<\/code>/.exec(tr)?.[1]
      const number = Number(literal)
      return number && symbol ? [{number: Number(number), symbol}] : []
    })
    const symbolIndexes = new Map<string, number>()
    trs.forEach(({symbol}, index) => {
      if (symbolIndexes.has(symbol)) return
      symbolIndexes.set(symbol, index)
    })

    return [
      `/** Source ${docsUrl} */`,
      `// last fetched: ${new Date().toISOString()}`,
      '// 👆 delete line above to invalidate these codes, forcing eslint to fetch new ones',
      'export const pgErrorCodes = {',
      ...trs.map(({number, symbol}) => `  '${number}': '${symbol}',`),
      '} as const satisfies Record<string, string>',
      '',
      'export const pgErrorCodesBySymbol = {',
      ...symbolIndexes.entries().map(([symbol, index]) => `  ${symbol}: '${trs[index].number}',`),
      '} as const satisfies Record<string, string>',
    ].join('\n')
  }

  return meta.existingContent
}

export function errorFromUnknown(err: unknown) {
  if (looksLikeStandardSchemaFailure(err)) return new StandardSchemaV1Error(err)
  return err instanceof Error ? err : new Error(`Non error thrown: ${String(err)}`, {cause: err})
}

export namespace QueryError {
  export type Params = {
    query: Pick<SQLQuery<unknown>, 'name'> & Partial<SQLQuery<unknown>>
    result?: {rows: unknown[]}
    cause?: Error
  }
}
export class QueryError extends Error {
  query: QueryError.Params['query']
  result?: QueryError.Params['result']

  constructor(message: string, {query, result, cause}: QueryError.Params) {
    message = QueryError.getMessage(message, {query, result, cause})
    super(message, cause ? {cause} : undefined)
    this.query = query
    this.result = result
  }

  static getMessage(message: string, params: QueryError.Params) {
    const {query, cause} = params
    message = `[${query.name}]: ${message}`
    if (isPgErrorLike(cause)) {
      message += ` (${exports.pgErrorCodes[cause.code]})`
      message += `\n\n${cause.message}\n\n`
      message += `${QueryError.prettyPgErrorMessage(params) || ''}`.trim()
    } else if (looksLikeStandardSchemaFailure(cause)) {
      message += `: ${prettifyStandardSchemaError(cause)}`
    } else if (cause?.constructor?.name === 'ZodError') {
      message += ': see cause for details'
    } else if (typeof cause?.message === 'string') {
      message += `: ${cause?.message}`
    }
    return message
  }

  toJSON() {
    return {
      message: this.message,
      query: this.query,
      result: this.result,
      cause: this.cause,
    }
  }

  static prettyPgErrorMessage({cause, query}: QueryError.Params) {
    if (isPgErrorLike(cause)) {
      const position = Number(cause.position)

      const shortProps = Object.entries(cause)
        .filter(e => e[1])
        .map(entry => entry.join('='))
        .filter(s => s.length < 50)
        .join(', ')
      if (Number.isFinite(position) && query.sql) {
        const queryUpToPosition = query.sql.slice(0, position)
        const queryAfterPosition = query.sql.slice(position) + '\n'
        const linesUpToPosition = queryUpToPosition.split('\n')

        const positionColumn = linesUpToPosition.at(-1)!.length - 1

        const firstNewLineAfterPosition = queryAfterPosition.indexOf('\n')
        const snippet =
          queryUpToPosition +
          queryAfterPosition.slice(0, Math.max(0, firstNewLineAfterPosition)) +
          '\n' +
          '-'.repeat(Math.max(2, positionColumn)) +
          '👆' +
          '-'.repeat(Math.max(0, firstNewLineAfterPosition)) +
          queryAfterPosition.slice(firstNewLineAfterPosition, -1)

        return shortProps + '\n\n[annotated query]\n\n    ' + snippet.replaceAll('\n', '\n    ')
      }
      return shortProps
    }

    return null
  }

  [inspect.custom]() {
    if (isPgErrorLike(this.cause)) {
      const proxy = new Proxy(this, {
        get(target, prop, receiver) {
          if (prop === inspect.custom) return undefined
          return Reflect.get(target, prop, receiver)
        },
      })
      return inspect(proxy, {depth: null})
    }
    return this.message
  }
}

const isPgErrorLike = (err: unknown): err is {code: keyof typeof pgErrorCodes; position?: string} => {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err.code as string) in pgErrorCodes)
}

// codegen:start {preset: custom, export: fetchErrorCodes}
/** Source https://www.postgresql.org/docs/current/errcodes-appendix.html */
// last fetched: 2025-04-20T15:19:59.777Z
// 👆 delete line above to invalidate these codes, forcing eslint to fetch new ones
export const pgErrorCodes = {
  '1000': 'warning',
  '1008': 'implicit_zero_bit_padding',
  '1003': 'null_value_eliminated_in_set_function',
  '1007': 'privilege_not_granted',
  '1006': 'privilege_not_revoked',
  '1004': 'string_data_right_truncation',
  '2000': 'no_data',
  '2001': 'no_additional_dynamic_result_sets_returned',
  '3000': 'sql_statement_not_yet_complete',
  '8000': 'connection_exception',
  '8003': 'connection_does_not_exist',
  '8006': 'connection_failure',
  '8001': 'sqlclient_unable_to_establish_sqlconnection',
  '8004': 'sqlserver_rejected_establishment_of_sqlconnection',
  '8007': 'transaction_resolution_unknown',
  '9000': 'triggered_action_exception',
  '20000': 'case_not_found',
  '21000': 'cardinality_violation',
  '22000': 'data_exception',
  '22021': 'character_not_in_repertoire',
  '22008': 'datetime_field_overflow',
  '22012': 'division_by_zero',
  '22005': 'error_in_assignment',
  '22022': 'indicator_overflow',
  '22015': 'interval_field_overflow',
  '22014': 'invalid_argument_for_ntile_function',
  '22016': 'invalid_argument_for_nth_value_function',
  '22018': 'invalid_character_value_for_cast',
  '22007': 'invalid_datetime_format',
  '22019': 'invalid_escape_character',
  '22025': 'invalid_escape_sequence',
  '22010': 'invalid_indicator_parameter_value',
  '22023': 'invalid_parameter_value',
  '22013': 'invalid_preceding_or_following_size',
  '22009': 'invalid_time_zone_displacement_value',
  '22004': 'null_value_not_allowed',
  '22002': 'null_value_no_indicator_parameter',
  '22003': 'numeric_value_out_of_range',
  '22026': 'string_data_length_mismatch',
  '22001': 'string_data_right_truncation',
  '22011': 'substring_error',
  '22027': 'trim_error',
  '22024': 'unterminated_c_string',
  '22030': 'duplicate_json_object_key_value',
  '22031': 'invalid_argument_for_sql_json_datetime_function',
  '22032': 'invalid_json_text',
  '22033': 'invalid_sql_json_subscript',
  '22034': 'more_than_one_sql_json_item',
  '22035': 'no_sql_json_item',
  '22036': 'non_numeric_sql_json_item',
  '22037': 'non_unique_keys_in_a_json_object',
  '22038': 'singleton_sql_json_item_required',
  '22039': 'sql_json_array_not_found',
  '23000': 'integrity_constraint_violation',
  '23001': 'restrict_violation',
  '23502': 'not_null_violation',
  '23503': 'foreign_key_violation',
  '23505': 'unique_violation',
  '23514': 'check_violation',
  '24000': 'invalid_cursor_state',
  '25000': 'invalid_transaction_state',
  '25001': 'active_sql_transaction',
  '25002': 'branch_transaction_already_active',
  '25008': 'held_cursor_requires_same_isolation_level',
  '25003': 'inappropriate_access_mode_for_branch_transaction',
  '25004': 'inappropriate_isolation_level_for_branch_transaction',
  '25005': 'no_active_sql_transaction_for_branch_transaction',
  '25006': 'read_only_sql_transaction',
  '25007': 'schema_and_data_statement_mixing_not_supported',
  '26000': 'invalid_sql_statement_name',
  '27000': 'triggered_data_change_violation',
  '28000': 'invalid_authorization_specification',
  '34000': 'invalid_cursor_name',
  '38000': 'external_routine_exception',
  '38001': 'containing_sql_not_permitted',
  '38002': 'modifying_sql_data_not_permitted',
  '38003': 'prohibited_sql_statement_attempted',
  '38004': 'reading_sql_data_not_permitted',
  '39000': 'external_routine_invocation_exception',
  '39001': 'invalid_sqlstate_returned',
  '39004': 'null_value_not_allowed',
  '40000': 'transaction_rollback',
  '40002': 'transaction_integrity_constraint_violation',
  '40001': 'serialization_failure',
  '40003': 'statement_completion_unknown',
  '42000': 'syntax_error_or_access_rule_violation',
  '42601': 'syntax_error',
  '42501': 'insufficient_privilege',
  '42846': 'cannot_coerce',
  '42803': 'grouping_error',
  '42830': 'invalid_foreign_key',
  '42602': 'invalid_name',
  '42622': 'name_too_long',
  '42939': 'reserved_name',
  '42804': 'datatype_mismatch',
  '42809': 'wrong_object_type',
  '42703': 'undefined_column',
  '42883': 'undefined_function',
  '42704': 'undefined_object',
  '42701': 'duplicate_column',
  '42723': 'duplicate_function',
  '42712': 'duplicate_alias',
  '42710': 'duplicate_object',
  '42702': 'ambiguous_column',
  '42725': 'ambiguous_function',
  '42611': 'invalid_column_definition',
  '44000': 'with_check_option_violation',
  '53000': 'insufficient_resources',
  '53100': 'disk_full',
  '53200': 'out_of_memory',
  '53300': 'too_many_connections',
  '53400': 'configuration_limit_exceeded',
  '54000': 'program_limit_exceeded',
  '54001': 'statement_too_complex',
  '54011': 'too_many_columns',
  '54023': 'too_many_arguments',
  '55000': 'object_not_in_prerequisite_state',
  '55006': 'object_in_use',
  '57000': 'operator_intervention',
  '57014': 'query_canceled',
  '58000': 'system_error',
  '58030': 'io_error',
} as const satisfies Record<string, string>

export const pgErrorCodesBySymbol = {
  warning: '1000',
  implicit_zero_bit_padding: '1008',
  null_value_eliminated_in_set_function: '1003',
  privilege_not_granted: '1007',
  privilege_not_revoked: '1006',
  string_data_right_truncation: '1004',
  no_data: '2000',
  no_additional_dynamic_result_sets_returned: '2001',
  sql_statement_not_yet_complete: '3000',
  connection_exception: '8000',
  connection_does_not_exist: '8003',
  connection_failure: '8006',
  sqlclient_unable_to_establish_sqlconnection: '8001',
  sqlserver_rejected_establishment_of_sqlconnection: '8004',
  transaction_resolution_unknown: '8007',
  triggered_action_exception: '9000',
  case_not_found: '20000',
  cardinality_violation: '21000',
  data_exception: '22000',
  character_not_in_repertoire: '22021',
  datetime_field_overflow: '22008',
  division_by_zero: '22012',
  error_in_assignment: '22005',
  indicator_overflow: '22022',
  interval_field_overflow: '22015',
  invalid_argument_for_ntile_function: '22014',
  invalid_argument_for_nth_value_function: '22016',
  invalid_character_value_for_cast: '22018',
  invalid_datetime_format: '22007',
  invalid_escape_character: '22019',
  invalid_escape_sequence: '22025',
  invalid_indicator_parameter_value: '22010',
  invalid_parameter_value: '22023',
  invalid_preceding_or_following_size: '22013',
  invalid_time_zone_displacement_value: '22009',
  null_value_not_allowed: '22004',
  null_value_no_indicator_parameter: '22002',
  numeric_value_out_of_range: '22003',
  string_data_length_mismatch: '22026',
  substring_error: '22011',
  trim_error: '22027',
  unterminated_c_string: '22024',
  duplicate_json_object_key_value: '22030',
  invalid_argument_for_sql_json_datetime_function: '22031',
  invalid_json_text: '22032',
  invalid_sql_json_subscript: '22033',
  more_than_one_sql_json_item: '22034',
  no_sql_json_item: '22035',
  non_numeric_sql_json_item: '22036',
  non_unique_keys_in_a_json_object: '22037',
  singleton_sql_json_item_required: '22038',
  sql_json_array_not_found: '22039',
  integrity_constraint_violation: '23000',
  restrict_violation: '23001',
  not_null_violation: '23502',
  foreign_key_violation: '23503',
  unique_violation: '23505',
  check_violation: '23514',
  invalid_cursor_state: '24000',
  invalid_transaction_state: '25000',
  active_sql_transaction: '25001',
  branch_transaction_already_active: '25002',
  held_cursor_requires_same_isolation_level: '25008',
  inappropriate_access_mode_for_branch_transaction: '25003',
  inappropriate_isolation_level_for_branch_transaction: '25004',
  no_active_sql_transaction_for_branch_transaction: '25005',
  read_only_sql_transaction: '25006',
  schema_and_data_statement_mixing_not_supported: '25007',
  invalid_sql_statement_name: '26000',
  triggered_data_change_violation: '27000',
  invalid_authorization_specification: '28000',
  invalid_cursor_name: '34000',
  external_routine_exception: '38000',
  containing_sql_not_permitted: '38001',
  modifying_sql_data_not_permitted: '38002',
  prohibited_sql_statement_attempted: '38003',
  reading_sql_data_not_permitted: '38004',
  external_routine_invocation_exception: '39000',
  invalid_sqlstate_returned: '39001',
  transaction_rollback: '40000',
  transaction_integrity_constraint_violation: '40002',
  serialization_failure: '40001',
  statement_completion_unknown: '40003',
  syntax_error_or_access_rule_violation: '42000',
  syntax_error: '42601',
  insufficient_privilege: '42501',
  cannot_coerce: '42846',
  grouping_error: '42803',
  invalid_foreign_key: '42830',
  invalid_name: '42602',
  name_too_long: '42622',
  reserved_name: '42939',
  datatype_mismatch: '42804',
  wrong_object_type: '42809',
  undefined_column: '42703',
  undefined_function: '42883',
  undefined_object: '42704',
  duplicate_column: '42701',
  duplicate_function: '42723',
  duplicate_alias: '42712',
  duplicate_object: '42710',
  ambiguous_column: '42702',
  ambiguous_function: '42725',
  invalid_column_definition: '42611',
  with_check_option_violation: '44000',
  insufficient_resources: '53000',
  disk_full: '53100',
  out_of_memory: '53200',
  too_many_connections: '53300',
  configuration_limit_exceeded: '53400',
  program_limit_exceeded: '54000',
  statement_too_complex: '54001',
  too_many_columns: '54011',
  too_many_arguments: '54023',
  object_not_in_prerequisite_state: '55000',
  object_in_use: '55006',
  operator_intervention: '57000',
  query_canceled: '57014',
  system_error: '58000',
  io_error: '58030',
} as const satisfies Record<string, string>
// codegen:end
