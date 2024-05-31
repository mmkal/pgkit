/* eslint-disable @typescript-eslint/no-shadow */
import * as pgMem from 'pg-mem'
import * as pgSqlAstParser from 'pgsql-ast-parser'
import {beforeAll, beforeEach, expect, test, vi} from 'vitest'
import {FieldInfo, createClient, sql} from '../src'

export let client: Awaited<ReturnType<typeof createClient>>
let sqlProduced = [] as {sql: string; values: any[]}[]

expect.addSnapshotSerializer({
  test: () => true,
  print: val => JSON.stringify(val, null, 2),
})

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres', {
    wrapQueryFn: queryFn => {
      return async query => {
        sqlProduced.push({sql: query.sql, values: query.values})
        return queryFn(query)
      }
    },
  })
})

beforeEach(async () => {
  await client.query(sql`
    drop table if exists recipes_test;
    create table recipes_test(id int, name text);
    insert into recipes_test values (1, 'one'), (2, 'two'), (3, 'three');
  `)
  sqlProduced = []
})

test('Inserting many rows with sql.unnest', async () => {
  // Pass an array of rows to be inserted. There's only one variable in the generated SQL per column

  await client.query(sql`
    insert into recipes_test(id, name)
    select *
    from ${sql.unnest(
      [
        [1, 'one'],
        [2, 'two'],
        [3, 'three'],
      ],
      ['int4', 'text'],
    )}
  `)

  expect(sqlProduced).toMatchInlineSnapshot(`
    [
      {
        "sql": "\\n    insert into recipes_test(id, name)\\n    select *\\n    from unnest($1::int4[], $2::text[])\\n  ",
        "values": [
          [
            1,
            2,
            3
          ],
          [
            "one",
            "two",
            "three"
          ]
        ]
      }
    ]
  `)
})

test('Query logging', async () => {
  // Simplistic way of logging query times. For more accurate results, use process.hrtime()
  const log = vi.fn()
  const client = createClient('postgresql://postgres:postgres@localhost:5432/postgres', {
    wrapQueryFn: queryFn => {
      return async query => {
        const start = Date.now()
        const result = await queryFn(query)
        const end = Date.now()
        log({start, end, took: end - start, query, result})
        return result
      }
    },
  })

  await client.query(sql`select * from recipes_test`)

  expect(log.mock.calls[0][0]).toMatchInlineSnapshot(
    {
      start: expect.any(Number),
      end: expect.any(Number),
      took: expect.any(Number),
    },
    `
      {
        "start": {
          "inverse": false
        },
        "end": {
          "inverse": false
        },
        "took": {
          "inverse": false
        },
        "query": {
          "name": "select-recipes_test_8d7ce25",
          "sql": "select * from recipes_test",
          "token": "sql",
          "values": []
        },
        "result": {
          "rows": [
            {
              "id": 1,
              "name": "one"
            },
            {
              "id": 2,
              "name": "two"
            },
            {
              "id": 3,
              "name": "three"
            }
          ],
          "command": "SELECT",
          "rowCount": 3,
          "fields": [
            {
              "name": "id",
              "tableID": 40444,
              "columnID": 1,
              "dataTypeID": 23,
              "dataTypeSize": 4,
              "dataTypeModifier": -1,
              "format": "text"
            },
            {
              "name": "name",
              "tableID": 40444,
              "columnID": 2,
              "dataTypeID": 25,
              "dataTypeSize": -1,
              "dataTypeModifier": -1,
              "format": "text"
            }
          ]
        }
      }
    `,
  )
})

test('query timeouts', async () => {
  const shortTimeoutMs = 20
  const impatient = createClient(client.connectionString() + '?shortTimeout', {
    pgpOptions: {
      connect: ({client}) => {
        client.connectionParameters.query_timeout = shortTimeoutMs
      },
    },
  })
  const patient = createClient(client.connectionString() + '?longTimeout', {
    pgpOptions: {
      connect: ({client}) => {
        client.connectionParameters.query_timeout = shortTimeoutMs * 3
      },
    },
  })

  const sleepSeconds = (shortTimeoutMs * 2) / 1000
  await expect(impatient.one(sql`select pg_sleep(${sleepSeconds})`)).rejects.toThrowErrorMatchingInlineSnapshot(
    `
      {
        "cause": {
          "query": {
            "name": "select_9dcc021",
            "sql": "select pg_sleep($1)",
            "token": "sql",
            "values": [
              0.04
            ]
          },
          "error": {
            "query": "select pg_sleep(0.04)"
          }
        }
      }
    `,
  )
  await expect(patient.one(sql`select pg_sleep(${sleepSeconds})`)).resolves.toMatchObject({
    pg_sleep: '',
  })
})

test('switchable clients', async () => {
  const shortTimeoutMs = 20
  const impatientClient = createClient(client.connectionString() + '?shortTimeout', {
    pgpOptions: {
      connect: ({client}) => {
        client.connectionParameters.query_timeout = shortTimeoutMs
      },
    },
  })
  const patientClient = createClient(client.connectionString() + '?longTimeout', {
    pgpOptions: {
      connect: ({client}) => {
        client.connectionParameters.query_timeout = shortTimeoutMs * 3
      },
    },
  })

  const appClient = createClient(client.connectionString(), {
    wrapQueryFn: _queryFn => {
      return async query => {
        let clientToUse = patientClient
        try {
          // use https://www.npmjs.com/package/pgsql-ast-parser - note that this is just an example, you may want to do something like route
          // readonly queries to a readonly connection, and others to a readwrite connection.
          const parsed = pgSqlAstParser.parse(query.sql)
          if (parsed.every(statement => statement.type === 'select')) {
            clientToUse = impatientClient
          }
        } catch {
          // ignore
        }

        return clientToUse.query(query)
      }
    },
  })

  const sleepSeconds = (shortTimeoutMs * 2) / 1000

  await expect(
    appClient.one(sql`
      select pg_sleep(${sleepSeconds})
    `),
  ).rejects.toThrowErrorMatchingInlineSnapshot(`
    {
      "cause": {
        "query": {
          "name": "select_6289211",
          "sql": "\\n      select pg_sleep($1)\\n    ",
          "token": "sql",
          "values": [
            0.04
          ]
        },
        "error": {
          "query": "\\n      select pg_sleep(0.04)\\n    "
        }
      }
    }
  `)
  await expect(
    appClient.one(sql`
      with delay as (
        select pg_sleep(${sleepSeconds})
      )
      insert into recipes_test (id, name)
      values (10, 'ten')
      returning *
    `),
  ).resolves.toMatchObject({
    id: 10,
    name: 'ten',
  })
})

test('mocking', async () => {
  const fakeDb = pgMem.newDb() // https://www.npmjs.com/package/pg-mem
  const client = createClient('postgresql://', {
    wrapQueryFn: () => {
      return async query => {
        // not a great way to do pass to pg-mem, in search of a better one: https://github.com/oguimbal/pg-mem/issues/384
        let statement = pgSqlAstParser.parse(query.sql)
        statement = JSON.parse(JSON.stringify(statement), (key, value) => {
          if (value?.type === 'parameter' && typeof value?.name === 'string') {
            const literalValue = query.values[Number(value.name.slice(1)) - 1]
            return {type: 'string', value: literalValue}
          }
          return value
        })
        const result = fakeDb.public.query(statement)
        return {
          ...result,
          fields: result.fields as {}[] as FieldInfo[],
        }
      }
    },
  })

  await client.query(sql`create table recipes_test(id int, name text)`)

  const insert = await client.one(sql`insert into recipes_test(id, name) values (${10}, 'ten') returning *`)
  expect(insert).toMatchObject({id: 10, name: 'ten'})

  const select = await client.any(sql`select name from recipes_test`)
  expect(select).toMatchObject([{name: 'ten'}])
})
