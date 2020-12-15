const {SlonikMigrator} = require('@slonik/migrator')
const {slonik} = require('./dist/db')

const migrator = new SlonikMigrator({
  slonik,
  migrationTableName: 'demo_migration',
  migrationsPath: __dirname + '/migrations',
  logger: console,
})

migrator.runAsCLI()
