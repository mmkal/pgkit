import {QueryResultRowType, sql as slonikSql, TaggedTemplateLiteralInvocationType, ValueExpressionType, ClientConfigurationType, DatabasePoolType, createPool} from 'slonik'

import * as fs from 'fs'
import { basename, join } from 'path'
import { inspect } from 'util';

const keys = <T>(obj: T) => Object.keys(obj) as Array<keyof T>
const toPairs = <T>(obj: T) => keys(obj).map(k => [k, obj[k]] as [keyof T, T[keyof T]])
const fromPairs = <K, V>(pairs: Array<[K, V]>) => pairs.reduce(
  (obj, [k, v]) => ({ ...obj, [k as any]: v }),
  {} as Record<string, V>
) as Record<string, V>
const orderBy = <T>(list: T[], cb: (value: T) => string | number) => [...list].sort((a, b) => {
  const left = cb(a)
  const right = cb(b)
  return left < right ? -1 : left > right ? 1 : 0
})

export interface GenericSqlTaggedTemplateType<T> {
  <U = T>(template: TemplateStringsArray, ...vals: ValueExpressionType[]): TaggedTemplateLiteralInvocationType<U>
}

export interface TypeGenConfig<KnownTypes> {
  knownTypes: KnownTypes
  /**
   * where to write types.
   * if this is a string, types will be written to the path with that value
   */
  writeTypes?: false | string
  /**
   * if true, generated code directory will be wiped and reinitialised on startup.
   */
  reset?: boolean
  /**
   * map from postgres data type id (oid) to io-ts-codegen type.
   */
  typeMapper?: {
    [K in keyof PgTypes<KnownTypes>]?: [string, (value: string) => unknown]
  }
}

export type PgTypes<KnownTypes> = {
  [K in '_pg_types']: K extends keyof KnownTypes ? KnownTypes[K] : never
}['_pg_types']

export type DefaultType<KnownTypes> = {
  [K in 'defaultType']: K extends keyof KnownTypes ? KnownTypes[K] : QueryResultRowType
}['defaultType']

export type TypeGenClientConfig = Pick<ClientConfigurationType, 'interceptors' | 'typeParsers'>
export interface TypeGen<KnownTypes> {
  poolConfig: TypeGenClientConfig
  sql: typeof slonikSql & {
    [K in keyof KnownTypes]: GenericSqlTaggedTemplateType<KnownTypes[K]>
  } & {
    [K in string]: GenericSqlTaggedTemplateType<DefaultType<KnownTypes>>
  }
}

export const setupTypeGen = <KnownTypes>(config: TypeGenConfig<KnownTypes>): TypeGen<KnownTypes> => {
  const {sql: sqlGetter, poolConfig} = setupSqlGetter(config)
  const _sql: any = (...args: Parameters<typeof slonikSql>) => slonikSql(...args)
  Object.keys(config.knownTypes).forEach(name => _sql[name] = sqlGetter(name))
  return {
    poolConfig,
    sql: new Proxy(_sql, {
      get(_, key) {
        if (typeof key === 'string' && !(key in _sql)) {
          return _sql[key] = sqlGetter(key)
        }
        return _sql[key]
      },
    }),
  }
}

export interface TypeGenWithSqlGetter<KnownTypes> {
  poolConfig: TypeGenClientConfig
  sql: <Identifier extends string>(identifier: Identifier) =>
    GenericSqlTaggedTemplateType<Identifier extends keyof KnownTypes ? KnownTypes[Identifier] : any>
}

export const createCodegenDirectory = (directory: string) => {
  fs.mkdirSync(directory, {recursive: true})
  fs.writeFileSync(join(directory, 'index.ts'), 'export const knownTypes = {}\n', 'utf8')
}

export const resetCodegenDirectory = (directory: string) => {
  if (fs.existsSync(directory)) {
    fs.readdirSync(directory)
      .forEach(filename => fs.unlinkSync(join(directory, filename)))
    fs.rmdirSync(directory)
  }
  createCodegenDirectory(directory)
}

export const setupSqlGetter = <KnownTypes>(config: TypeGenConfig<KnownTypes>): TypeGenWithSqlGetter<KnownTypes> => {
  if (config.reset && typeof config.writeTypes === 'string') {
    resetCodegenDirectory(config.writeTypes)
  }
  const typeParsers = config.typeMapper
    ? keys(config.typeMapper).map(name => ({
      name: name as string,
      parse: config.typeMapper![name]![1],
    }))
    : []
  if (!config.writeTypes) {
    // not writing types, no need to track queries or intercept results
    return {
      sql: Object.assign(
        () => slonikSql,
        fromPairs(keys(config.knownTypes).map(k => [k, slonikSql])),
      ),
      poolConfig: {
        interceptors: [],
        typeParsers,
      }
    }
  }
  const writeTypes = getFsTypeWriter(config.writeTypes)
    
  const pgTypes = (config.knownTypes as any)._pg_types || {}
  const oidToTypeName = fromPairs(Object.keys(pgTypes).map(k => [pgTypes[k], k]))
  const mapping: Record<string, [string] | undefined> = config.typeMapper || {} as any
  const typescriptTypeName = (dataTypeId: number): string => {
    const typeName = oidToTypeName[dataTypeId]
    const [customType] = mapping[typeName] || [undefined]
    return customType || builtInTypeMappings[typeName] || 'unknown'
  }

  const _map: Record<string, string[] | undefined> = {}
  let _types: Record<string, number> | undefined = undefined
  const mapKey = (sqlValue: { sql: string, values?: any }) =>
    JSON.stringify([sqlValue.sql, sqlValue.values])

  const sql: TypeGenWithSqlGetter<KnownTypes>['sql'] = identifier => {
    const _wrappedSqlFunction = (...args: Parameters<typeof slonikSql>) => {
      const result = slonikSql(...args)
      const key = mapKey(result)
      const _identifiers = _map[key] = _map[key] || []
      _identifiers.push(identifier)
      return result
    }
    return Object.assign(_wrappedSqlFunction, slonikSql)
  }
  return {
    sql,
    poolConfig: {
      interceptors: [{
        beforePoolConnectionRelease: async (_context, connection) => {
          if (!_types && typeof config.writeTypes === 'string') {
            const types = await connection.any(slonikSql`
              select typname, oid
              from pg_type
              where (typnamespace = 11 and typname not like 'pg_%')
              or (typrelid = 0 and typelem = 0)
            `)
            _types = fromPairs(types.map(t => [t.typname, t.oid as number]))
            fs.writeFileSync(
              join(config.writeTypes, '_pg_types.ts'),
              [
                `${header}`,
                `export const _pg_types = ${inspect(_types)} as const`,
                `export type _pg_types = typeof _pg_types`,
              ].join('\n\n'),
            )
          }
        },
        afterQueryExecution: ({ originalQuery }, _query, result) => {
          const trimmedSql = originalQuery.sql.replace(/^\n+/, '').trimRight()
          const _identifiers = _map[mapKey(originalQuery)]
          _identifiers && _identifiers.forEach(identifier => writeTypes(
            identifier,
            result.fields.map(f => ({
              name: f.name,
              value: typescriptTypeName(f.dataTypeID),
              description: `${oidToTypeName[f.dataTypeID]} (oid: ${f.dataTypeID})`,
            })),
            trimmedSql.trim(),
          ))

          return result
        }
      }],
      typeParsers,
    }
  }
}

export interface Property { name: string, value: string, description?: string }
const blockComment = (str?: string) => str && '/** ' + str.replace(/\*\//g, '') + ' */'
const codegen = {
  writeInterface: (name: string, properties: Property[], description?: string) =>
    `export interface ${name} ` + codegen.writeInterfaceBody(properties, description),

  writeInterfaceBody: (properties: Property[], description?: string) => [
    blockComment(description),
    `{`,
    ...properties.map(p => [
      blockComment(p.description),
      `${p.name}: ${p.value}`
    ].filter(Boolean).map(s => '  ' + s).join('\n')),
    `}`,
  ].filter(Boolean).join('\n')
}

const header = [
  '/* eslint-disable */',
  '// tslint:disable',
  `// this file is generated by a tool; don't change it manually.`,
].join('\n')

const getFsTypeWriter = (generatedPath: string) =>
  (typeName: string, properties: Property[], description: string) => {
    const tsPath = join(generatedPath, `${typeName}.ts`)
    const existingContent = fs.existsSync(tsPath)
      ? fs.readFileSync(tsPath, 'utf8')
      : ''
    const metaDeclaration = `export const ${typeName}_meta_v0 = `
    const lines = existingContent.split('\n').map(line => line.trim())
    const metaLine = lines.find(line => line.startsWith(metaDeclaration)) || '[]'
    let _entries: Array<typeof newEntry> = JSON.parse(metaLine.replace(metaDeclaration, ''))

    const newEntry = { properties, description }
    _entries.unshift(newEntry)
    _entries = orderBy(_entries, e => e.description)
    _entries = _entries
      .filter((e, i, arr) => i === arr.findIndex(x => x.description === e.description))

    const contnt = [
      header,
      ``,
      `export interface ${typeName}_QueryTypeMap {`,
      '  ' + _entries
        .map(e => `[${JSON.stringify(e.description)}]: ${codegen.writeInterfaceBody(e.properties)}`)
        .join('\n')
        .replace(/\n/g, '\n  '),
      `}`,
      ``,
      `export type ${typeName}_UnionType = ${typeName}_QueryTypeMap[keyof ${typeName}_QueryTypeMap]`,
      ``,
      `export type ${typeName} = {`,
      `  [K in keyof ${typeName}_UnionType]: ${typeName}_UnionType[K]`,
      `}`,
      `export const ${typeName} = {} as ${typeName}`,
      ``,
      `${metaDeclaration}${JSON.stringify(_entries)}`,
      ``,
    ].join('\n')

    void fs.writeFileSync(tsPath, contnt, 'utf8')

    const knownTypes = fs.readdirSync(generatedPath)
      .filter(filename => filename !== 'index.ts')
      .map(filename => basename(filename, '.ts'))

    void fs.writeFileSync(
      join(generatedPath, `index.ts`),
      [
        header,
        ...knownTypes.map(name => `import {${name}} from './${name}'`),
        '',
        ...knownTypes.map(name => `export {${name}}`),
        '',
        codegen.writeInterface('KnownTypes', knownTypes.map(name => ({ name, value: name }))),
        '',
        '/** runtime-accessible object with phantom type information of query results. */',
        `export const knownTypes: KnownTypes = {`,
        ...knownTypes.map(name => `  ${name},`),
        `}`,
        '',
      ].join('\n')
    )
  }

const builtInTypeMappings: Record<string, string | undefined> = {
  timestamptz: 'number',
  text: 'string',
  varchar: 'string',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  bool: 'boolean',
  _text: 'string[]'
}

export const main = (argv: string[]) => {
  const setupDir = argv.slice(-1)[0]
  console.log(`setting up generated types in ${setupDir}`)
  resetCodegenDirectory(setupDir)
}
