import {SQLQuery} from './types'

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

    return [
      `/** Source ${docsUrl} */`,
      `// last fetched: ${new Date().toISOString()}`,
      '// 👆 delete line above to invalidate these codes, forcing eslint to fetch new ones',
      'export const pgErrorCodes: Record<number, string> = {',
      ...trs.map(({number, symbol}) => `  ${number}: '${symbol}',`),
      '}',
    ].join('\n')
  }

  return meta.existingContent
}

export function errorFromUnknown(err: unknown) {
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
    super(`[${query.name}]: ${message}`, cause ? {cause} : undefined)
    this.query = query
    this.result = result
  }

  toJSON() {
    return {
      message: this.message,
      query: this.query,
      result: this.result,
      cause: this.cause,
    }
  }
}

// codegen:start {preset: custom, export: fetchErrorCodes}
/** Source https://www.postgresql.org/docs/current/errcodes-appendix.html */
// last fetched: 2024-01-29T01:47:28.343Z
// 👆 delete line above to invalidate these codes, forcing eslint to fetch new ones
export const pgErrorCodes: Record<number, string> = {
  1000: 'warning',
  1008: 'implicit_zero_bit_padding',
  1003: 'null_value_eliminated_in_set_function',
  1007: 'privilege_not_granted',
  1006: 'privilege_not_revoked',
  1004: 'string_data_right_truncation',
  2000: 'no_data',
  2001: 'no_additional_dynamic_result_sets_returned',
  3000: 'sql_statement_not_yet_complete',
  8000: 'connection_exception',
  8003: 'connection_does_not_exist',
  8006: 'connection_failure',
  8001: 'sqlclient_unable_to_establish_sqlconnection',
  8004: 'sqlserver_rejected_establishment_of_sqlconnection',
  8007: 'transaction_resolution_unknown',
  9000: 'triggered_action_exception',
  20_000: 'case_not_found',
  21_000: 'cardinality_violation',
  22_000: 'data_exception',
  22_021: 'character_not_in_repertoire',
  22_008: 'datetime_field_overflow',
  22_012: 'division_by_zero',
  22_005: 'error_in_assignment',
  22_022: 'indicator_overflow',
  22_015: 'interval_field_overflow',
  22_014: 'invalid_argument_for_ntile_function',
  22_016: 'invalid_argument_for_nth_value_function',
  22_018: 'invalid_character_value_for_cast',
  22_007: 'invalid_datetime_format',
  22_019: 'invalid_escape_character',
  22_025: 'invalid_escape_sequence',
  22_010: 'invalid_indicator_parameter_value',
  22_023: 'invalid_parameter_value',
  22_013: 'invalid_preceding_or_following_size',
  22_009: 'invalid_time_zone_displacement_value',
  22_004: 'null_value_not_allowed',
  22_002: 'null_value_no_indicator_parameter',
  22_003: 'numeric_value_out_of_range',
  22_026: 'string_data_length_mismatch',
  22_001: 'string_data_right_truncation',
  22_011: 'substring_error',
  22_027: 'trim_error',
  22_024: 'unterminated_c_string',
  22_030: 'duplicate_json_object_key_value',
  22_031: 'invalid_argument_for_sql_json_datetime_function',
  22_032: 'invalid_json_text',
  22_033: 'invalid_sql_json_subscript',
  22_034: 'more_than_one_sql_json_item',
  22_035: 'no_sql_json_item',
  22_036: 'non_numeric_sql_json_item',
  22_037: 'non_unique_keys_in_a_json_object',
  22_038: 'singleton_sql_json_item_required',
  22_039: 'sql_json_array_not_found',
  23_000: 'integrity_constraint_violation',
  23_001: 'restrict_violation',
  23_502: 'not_null_violation',
  23_503: 'foreign_key_violation',
  23_505: 'unique_violation',
  23_514: 'check_violation',
  24_000: 'invalid_cursor_state',
  25_000: 'invalid_transaction_state',
  25_001: 'active_sql_transaction',
  25_002: 'branch_transaction_already_active',
  25_008: 'held_cursor_requires_same_isolation_level',
  25_003: 'inappropriate_access_mode_for_branch_transaction',
  25_004: 'inappropriate_isolation_level_for_branch_transaction',
  25_005: 'no_active_sql_transaction_for_branch_transaction',
  25_006: 'read_only_sql_transaction',
  25_007: 'schema_and_data_statement_mixing_not_supported',
  26_000: 'invalid_sql_statement_name',
  27_000: 'triggered_data_change_violation',
  28_000: 'invalid_authorization_specification',
  34_000: 'invalid_cursor_name',
  38_000: 'external_routine_exception',
  38_001: 'containing_sql_not_permitted',
  38_002: 'modifying_sql_data_not_permitted',
  38_003: 'prohibited_sql_statement_attempted',
  38_004: 'reading_sql_data_not_permitted',
  39_000: 'external_routine_invocation_exception',
  39_001: 'invalid_sqlstate_returned',
  39_004: 'null_value_not_allowed',
  40_000: 'transaction_rollback',
  40_002: 'transaction_integrity_constraint_violation',
  40_001: 'serialization_failure',
  40_003: 'statement_completion_unknown',
  42_000: 'syntax_error_or_access_rule_violation',
  42_601: 'syntax_error',
  42_501: 'insufficient_privilege',
  42_846: 'cannot_coerce',
  42_803: 'grouping_error',
  42_830: 'invalid_foreign_key',
  42_602: 'invalid_name',
  42_622: 'name_too_long',
  42_939: 'reserved_name',
  42_804: 'datatype_mismatch',
  42_809: 'wrong_object_type',
  42_703: 'undefined_column',
  42_883: 'undefined_function',
  42_704: 'undefined_object',
  42_701: 'duplicate_column',
  42_723: 'duplicate_function',
  42_712: 'duplicate_alias',
  42_710: 'duplicate_object',
  42_702: 'ambiguous_column',
  42_725: 'ambiguous_function',
  42_611: 'invalid_column_definition',
  44_000: 'with_check_option_violation',
  53_000: 'insufficient_resources',
  53_100: 'disk_full',
  53_200: 'out_of_memory',
  53_300: 'too_many_connections',
  53_400: 'configuration_limit_exceeded',
  54_000: 'program_limit_exceeded',
  54_001: 'statement_too_complex',
  54_011: 'too_many_columns',
  54_023: 'too_many_arguments',
  55_000: 'object_not_in_prerequisite_state',
  55_006: 'object_in_use',
  57_000: 'operator_intervention',
  57_014: 'query_canceled',
  58_000: 'system_error',
  58_030: 'io_error',
  72_000: 'snapshot_too_old',
}
// codegen:end
