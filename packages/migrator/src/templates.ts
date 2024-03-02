/* eslint-disable mmkal/unicorn/template-indent */
export const sqlUp = `raise 'up migration not implemented'
`

export const sqlDown = `raise 'down migration not implemented'
`

export const typescript = `
import {Migration} from '@pgkit/migrator'

export const up: Migration = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'up migration not implemented'\`)
}

export const down: Migration = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'down migration not implemented'\`)
}
`.trimStart()

export const esm = `
/** @type {import('@pgkit/migrator').Migration} */
export const up = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'up migration not implemented'\`)
}

/** @type {import('@pgkit/migrator').Migration} */
export const down = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'down migration not implemented'\`)
}
`.trimStart()

export const cjs = `
/** @type {import('@pgkit/migrator').Migration} */
exports.up = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'up migration not implemented'\`)
}

/** @type {import('@pgkit/migrator').Migration} */
exports.down = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'down migration not implemented'\`)
}
`.trimStart()
