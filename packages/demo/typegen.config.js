require('dotenv-extended/config')
const {slonik} = require('./dist/db')

/** @type {import('@slonik/typegen').Options} */
module.exports.default = {
  connectionURI: process.env.POSTGRES_CONNECTION_STRING,
  poolConfig: slonik.configuration,
}
