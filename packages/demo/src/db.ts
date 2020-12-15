import {setupTypeGen} from '@slonik/typegen'
import {knownTypes} from './generated/db'
import {createPool} from 'slonik'
import {load} from 'dotenv-extended'

load()

export const {sql, poolConfig} = setupTypeGen({
  knownTypes: knownTypes,
  writeTypes: __dirname + '/../src/generated/db',
  typeMapper: {
    timestamptz: ['Date', str => new Date(str)],
  },
})

export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING!, {
  ...poolConfig,
  interceptors: [
    ...poolConfig.interceptors,
    {
      afterPoolConnection: async (context, connection) => {
        await connection.query(sql`
          create schema if not exists slonik_tools_demo_app;
          set search_path to slonik_tools_demo_app;
        `)
        return null
      },
    },
  ],
})
