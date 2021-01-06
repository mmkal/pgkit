import * as fs from 'fs' // no named imports
import 'path' // no import clause

export const a = fs.readFileSync

declare const gql: any
export const b = gql.Foo`someQuery {someField}`
