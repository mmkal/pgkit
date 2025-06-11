import { createClient } from "@pgkit/client";

export const {sql} = createClient(`postgresql://postgres:postgres@localhost:5432/postgres`)
