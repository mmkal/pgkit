import * as path from 'path'

export const appUrl = 'http://localhost:5173'
export const apiUrl = 'http://localhost:7002'
export const adminConnectionString = 'postgresql://postgres:postgres@localhost:5432/postgres'
export const connectionString = 'postgresql://postgres:postgres@localhost:5432/admin_test'

export const STORAGE_STATE = path.join(process.cwd(), 'playwright/.auth/user.json')
