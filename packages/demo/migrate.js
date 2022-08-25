const {SlonikMigrator, prettyLogger} = require('@slonik/migrator')
const {slonik} = require('./dist/db')

const migrator = new SlonikMigrator({
  slonik,
  migrationTableName: 'demo_migration',
  migrationsPath: __dirname + '/migrations',
  logger: prettyLogger,
})

migrator.runAsCLI()
