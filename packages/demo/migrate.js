require('@slonik/migrator').setupSlonikMigrator({
  migrationTableName: 'demo_migration',
  migrationsPath: __dirname + '/migrations',
  slonik: require('./dist/db').slonik,
  mainModule: module,
  logger: console,
})
