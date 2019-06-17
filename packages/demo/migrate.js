require('@slonik/migrator').setupSlonikMigrator({
  migrationsPath: __dirname + '/migrations',
  slonik: require('./dist/db').slonik,
  mainModule: module,
})
