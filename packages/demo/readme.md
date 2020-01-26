# slonik-tools-demo

A demo project which uses [@slonik/typegen](https://npmjs.com/package/@slonik/typegen) and [@slonik/migrator](https://npmjs.com/package/@slonik/migrator), intended to show a working example for each package.

The project was initially set up by running:
```bash
node migrate create users
npx slonik-typegen src/generated/db
```

The backend code lives in `./src`. `db.ts` contains the database configuration using `@slonik/typegen`. The api is implemented in `index.ts`, and takes advantage of the automatic interface generation from `@slonik/typegen`. The interfaces are in `./src/generated/db`.

To run or deploy the app, first compile with `yarn build`, then the script `yarn migrate` is used to apply database migrations using `@slonik/migrator`. The migration command script is `migrate.js`, and the sql migrations themselves are in `./migrations`. The server can be started with `yarn start`, then visiting http://localhost:8082.
