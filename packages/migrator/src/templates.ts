export const sqlUp = `raise 'up migration not implemented'
`

export const sqlDown = `raise 'down migration not implemented'
`

export const typescript = `
import {Migration} from '@slonik/migrator'

export const up: Migration = async ({slonik, sql}) => {
  await slonik.query(sql\`raise 'up migration not implemented'\`)
}

export const down: Migration = async ({slonik, sql}) => {
  await slonik.query(sql\`raise 'down migration not implemented'\`)
}
`.trimLeft()

export const javascript = `
/** @type {import('@sloink/migrator').Migration} */
exports.up = async ({slonik, sql}) => {
  await slonik.query(sql\`raise 'up migration not implemented'\`)
}

/** @type {import('@sloink/migrator').Migration} */
exports.down = async ({slonik, sql}) => {
  await slonik.query(sql\`raise 'down migration not implemented'\`)
}
`.trimLeft()
