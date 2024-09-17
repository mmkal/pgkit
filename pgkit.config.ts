export default {
    client: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
    },
    typegen: {
        psqlCommand: 'docker-compose exec -T postgres psql',
        checkClean: [],
    }
} satisfies import('./packages/pgkit/src/config').Config
