require('dotenv-extended/config')

/** @type {import('@slonik/typegen').Options} */
module.exports.default = {
  connectionURI: process.env.POSTGRES_CONNECTION_STRING,
}
