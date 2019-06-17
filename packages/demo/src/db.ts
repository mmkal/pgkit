import {setupTypeGen} from '@slonik/typegen'
import {knownTypes} from './generated/db'
import {createPool} from 'slonik'
import {load} from 'dotenv-extended'

load()

export const {sql, poolConfig} = setupTypeGen({
  knownTypes: knownTypes,
  writeTypes: __dirname + '/generated/db',
})

export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING!, poolConfig)
