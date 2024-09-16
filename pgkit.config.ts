export default {
    client: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
    },
} satisfies import('./packages/pgkit/src/config').Config
