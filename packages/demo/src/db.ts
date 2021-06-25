import {createPool, createTypeParserPreset} from 'slonik'
import {load} from 'dotenv-extended'

load()

export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING!, {
  typeParsers: [
    ...createTypeParserPreset(),
    {
      name: 'timestamptz',
      parse: str => new Date(str),
    },
  ],
})
