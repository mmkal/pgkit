/**
 * Global mappings from postgres type => typescript, in the absence of any field transformers.
 */
export const defaultGdescTypeMappings: Record<string, string> = {
  text: 'string',
  integer: 'number',
  boolean: 'boolean',
  json: 'any',
  jsonb: 'any',
  name: 'string',
  'double precision': 'number',
  'character varying': 'string',
  'timestamp with time zone': 'number',
}
