import {setupTypeGen} from '@slonik/typegen'
import {knownTypes} from './generated/db'
import {createPool} from 'slonik'
// @ts-ignore
import {createFieldNameTransformationInterceptor} from 'slonik-interceptor-field-name-transformation'
import {load} from 'dotenv-extended'
import {camelCase} from 'lodash'

load()

export const {sql, poolConfig} = setupTypeGen({
  knownTypes: knownTypes,
  writeTypes: __dirname + '/../src/generated/db',
  typeMapper: {
    timestamptz: ['Date', str => new Date(str)],
  },
  transformProperty: p => ({...p, name: camelCase(p.name)}),
})

export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING!, {
  ...poolConfig,
  interceptors: [
    createFieldNameTransformationInterceptor({format: 'CAMEL_CASE'}), // requires `transformProperty`
    ...(poolConfig.interceptors || [])
  ],
})
