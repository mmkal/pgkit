/**
 * Global mappings from postgres type => typescript, in the absence of any field transformers.
 */
export const defaultPGDataTypeToTypeScriptMappings: Record<string, string> = {
  text: 'string',
  integer: 'number',
  real: 'number',
  oid: 'number',
  boolean: 'boolean',
  name: 'string',
  'double precision': 'number',
  'character varying': 'string',
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
}

// todo: map from alias and/or oid to "regtype" which is what the above are
// https://www.postgresql-archive.org/OID-of-type-by-name-td3297240.html
