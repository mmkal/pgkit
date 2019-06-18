import {setupTypeGen} from '@slonik/typegen'
import {knownTypes} from './generated/db'
import {createPool} from 'slonik'
import {load} from 'dotenv-extended'

load()

export const {sql, poolConfig} = setupTypeGen({
  reset: true,
  knownTypes: knownTypes,
  writeTypes: __dirname + '/../src/generated/db',
  typeMapper: {
    timestamptz: ['Date', str => new Date(str)],
  },
})

export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING!, poolConfig)
