import {sql} from './generated/db'
import {createPool, createTypeParserPreset} from 'slonik'
import {load} from 'dotenv-extended'

load()

export {sql}

export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING!, {
  typeParsers: [
    ...createTypeParserPreset(),
    {
      name: 'timestamptz',
      parse: str => new Date(str),
    },
  ],
  interceptors: [
    {
      afterPoolConnection: async (context, connection) => {
        await connection.query(sql<queries.__unknown>`
          create schema if not exists slonik_tools_demo_app;
          set search_path to slonik_tools_demo_app;
        `)
        return null
      },
    },
  ],
})

module queries {
  /**
   * - query: `create schema if not exists slonik_tools_demo_app; set search_path to slonik_tools_demo_app;`
   */
  export interface __unknown {}
}
