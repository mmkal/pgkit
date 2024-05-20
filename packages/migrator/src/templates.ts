/* eslint-disable unicorn/template-indent */
export const sql = `-- Write your migration here`

export const typescript = `
import {Migration} from '@pgkit/migrator'

export const up: Migration = async ({context: {connection, sql}}) => {
  await connection.query(sql\`-- Write your migration here\`)
}
`.trimStart()

export const esm = `
/** @type {import('@pgkit/migrator').Migration} */
export const up = async ({context: {connection, sql}}) => {
  await connection.query(sql\`-- Write your migration here\`)
}
`.trimStart()

export const cjs = `
/** @type {import('@pgkit/migrator').Migration} */
exports.up = async ({context: {connection, sql}}) => {
  await connection.query(sql\`-- Write your migration here\`)
}
`.trimStart()
