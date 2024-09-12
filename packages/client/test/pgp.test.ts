import initPgp from 'pg-promise'
import {beforeEach, expect, test} from 'vitest'

let pgp: ReturnType<typeof initPgp>
let db: ReturnType<typeof pgp>

// mostly this is to document how relevant parts of pg-promise work

beforeEach(async () => {
  pgp ||= initPgp({})
  db ||= pgp('postgresql://postgres:postgres@localhost:5432/postgres?raw-pgp=true')

  await db.query(`drop table if exists pgp_test`)
  await db.query(`drop table if exists pgp_test_enum`)
  await db.query(`drop type if exists pgp_testenum`)

  await db.query(`create table pgp_test (id text)`)
  await db.query(`insert into pgp_test (id) values ('one'), ('two'), ('three')`)

  await db.query(`create type pgp_testenum as enum ('up', 'down', 'left', 'right')`)
  await db.query(`create table pgp_test_enum (direction pgp_testenum)`)
  await db.query(`insert into pgp_test_enum (direction) values ('up'), ('down')`)
})

test('pgp works', async () => {
  expect(true).toBe(true)
  expect(db).toBeDefined()
  const result = await db.query('SELECT 1 as foo')
  expect(result).toEqual([{foo: 1}])
})

test('any keyword', async () => {
  await db.query(`insert into pgp_test (id) values ('normal string'), ($1)`, ["'string with quotes'"])

  const req = {body: {ids: ['normal string', "'string with quotes'"]}}
  const x = await db.query('SELECT * FROM pgp_test WHERE id = ANY($1)', [req.body.ids])
  expect(x).toEqual([{id: 'normal string'}, {id: "'string with quotes'"}])
})

test('date', async () => {
  const result = await db.query(`select $1 as foo`, [new Date('2000-01-01T12:00:00Z')])
  expect(result[0].foo).toMatch(/2000-01-01T\d\d:00:00.000.*/)
  expect(new Date(result[0].foo as string).toISOString()).toMatchInlineSnapshot(`"2000-01-01T12:00:00.000Z"`)
})

test('identifiers', async () => {
  const tableName = 'pgp_test'
  const result = await db.query(`select count(*) from ${pgp.as.name(tableName)}`)
  expect(result).toEqual([{count: '3'}])
})

test('identifiers with dot', async () => {
  const result = await db.query(`select count(*) from $(p0:name).$(p1:name)`, {p0: 'public', p1: 'pgp_test'})
  expect(result).toEqual([{count: '3'}])
})

test('.as.name', async () => {
  expect(pgp.as.name('foo.bar')).toMatchInlineSnapshot(`""foo.bar""`)
})

test('unnest', async () => {
  const result = await db.query(`SELECT bar, baz FROM unnest($1, $2) AS foo(bar, baz)`, [
    [1, 2, 3, 4],
    ['a', 'b', 'c', 'd'],
  ])
  expect(result).toMatchInlineSnapshot(`
    [
      {
        "bar": 1,
        "baz": "a",
      },
      {
        "bar": 2,
        "baz": "b",
      },
      {
        "bar": 3,
        "baz": "c",
      },
      {
        "bar": 4,
        "baz": "d",
      },
    ]
  `)
})

test('prepared statement', async () => {
  const statement = new pgp.PreparedStatement({
    name: 'get-from-pgp_test',
    text: 'select * from pgp_test where id = $1',
    values: ['one'],
  })
  const result = await db.query(statement)
  expect(result).toEqual([{id: 'one'}])
})

test('non-string array', async () => {
  const statement = new pgp.PreparedStatement({
    name: 'non-string-array',
    text: `
      select
        1 one,
        array(select direction from pgp_test_enum order by direction::text) as two
    `,
    values: [],
  })
  const result = await db.query(statement)
  expect(result).toEqual([{one: 1, two: '{down,up}'}])
})

test('prepare statement command does not accept values', async () => {
  const prepareStatementSql = `prepare test_statement as select * from pgp_test where id = $1 or id = $2`

  await expect(db.query(prepareStatementSql, [])).rejects.toThrowErrorMatchingInlineSnapshot(
    `[RangeError: Variable $1 out of range. Parameters array length: 0]`,
  )

  await expect(db.query(prepareStatementSql, ['a', 'b'])).resolves.toMatchInlineSnapshot(`[]`)
})

test('type parsers', async () => {
  expect(await db.query(`select oid, typname from pg_type where typname = 'timestamptz'`)).toMatchInlineSnapshot(`
    [
      {
        "oid": 1184,
        "typname": "timestamptz",
      },
    ]
  `)
  const result = await db.query<Array<{oid: number; typname: string}>>(
    `select oid, typname, oid::regtype as regtype from pg_type where oid = any($1)`,
    [Object.values(pgp.pg.types.builtins)],
  )

  const jsonLines = result.map(r => JSON.stringify(r)).sort()
  expect(`[\n${jsonLines.join(',\n')}\n]`).toMatchInlineSnapshot(`
    "[
    {"oid":1033,"typname":"aclitem","regtype":"aclitem"},
    {"oid":1042,"typname":"bpchar","regtype":"character"},
    {"oid":1043,"typname":"varchar","regtype":"character varying"},
    {"oid":1082,"typname":"date","regtype":"date"},
    {"oid":1083,"typname":"time","regtype":"time without time zone"},
    {"oid":1114,"typname":"timestamp","regtype":"timestamp without time zone"},
    {"oid":114,"typname":"json","regtype":"json"},
    {"oid":1184,"typname":"timestamptz","regtype":"timestamp with time zone"},
    {"oid":1186,"typname":"interval","regtype":"interval"},
    {"oid":1266,"typname":"timetz","regtype":"time with time zone"},
    {"oid":142,"typname":"xml","regtype":"xml"},
    {"oid":1560,"typname":"bit","regtype":"bit"},
    {"oid":1562,"typname":"varbit","regtype":"bit varying"},
    {"oid":16,"typname":"bool","regtype":"boolean"},
    {"oid":17,"typname":"bytea","regtype":"bytea"},
    {"oid":1700,"typname":"numeric","regtype":"numeric"},
    {"oid":1790,"typname":"refcursor","regtype":"refcursor"},
    {"oid":18,"typname":"char","regtype":"\\"char\\""},
    {"oid":194,"typname":"pg_node_tree","regtype":"pg_node_tree"},
    {"oid":20,"typname":"int8","regtype":"bigint"},
    {"oid":21,"typname":"int2","regtype":"smallint"},
    {"oid":210,"typname":"_pg_type","regtype":"pg_type[]"},
    {"oid":2202,"typname":"regprocedure","regtype":"regprocedure"},
    {"oid":2203,"typname":"regoper","regtype":"regoper"},
    {"oid":2204,"typname":"regoperator","regtype":"regoperator"},
    {"oid":2205,"typname":"regclass","regtype":"regclass"},
    {"oid":2206,"typname":"regtype","regtype":"regtype"},
    {"oid":23,"typname":"int4","regtype":"integer"},
    {"oid":24,"typname":"regproc","regtype":"regproc"},
    {"oid":25,"typname":"text","regtype":"text"},
    {"oid":26,"typname":"oid","regtype":"oid"},
    {"oid":27,"typname":"tid","regtype":"tid"},
    {"oid":28,"typname":"xid","regtype":"xid"},
    {"oid":29,"typname":"cid","regtype":"cid"},
    {"oid":2950,"typname":"uuid","regtype":"uuid"},
    {"oid":2970,"typname":"txid_snapshot","regtype":"txid_snapshot"},
    {"oid":3220,"typname":"pg_lsn","regtype":"pg_lsn"},
    {"oid":3361,"typname":"pg_ndistinct","regtype":"pg_ndistinct"},
    {"oid":3402,"typname":"pg_dependencies","regtype":"pg_dependencies"},
    {"oid":3614,"typname":"tsvector","regtype":"tsvector"},
    {"oid":3615,"typname":"tsquery","regtype":"tsquery"},
    {"oid":3642,"typname":"gtsvector","regtype":"gtsvector"},
    {"oid":3734,"typname":"regconfig","regtype":"regconfig"},
    {"oid":3769,"typname":"regdictionary","regtype":"regdictionary"},
    {"oid":3802,"typname":"jsonb","regtype":"jsonb"},
    {"oid":4089,"typname":"regnamespace","regtype":"regnamespace"},
    {"oid":4096,"typname":"regrole","regtype":"regrole"},
    {"oid":602,"typname":"path","regtype":"path"},
    {"oid":604,"typname":"polygon","regtype":"polygon"},
    {"oid":650,"typname":"cidr","regtype":"cidr"},
    {"oid":700,"typname":"float4","regtype":"real"},
    {"oid":701,"typname":"float8","regtype":"double precision"},
    {"oid":718,"typname":"circle","regtype":"circle"},
    {"oid":774,"typname":"macaddr8","regtype":"macaddr8"},
    {"oid":790,"typname":"money","regtype":"money"},
    {"oid":829,"typname":"macaddr","regtype":"macaddr"},
    {"oid":869,"typname":"inet","regtype":"inet"}
    ]"
  `)

  const oidToTypname = Object.fromEntries(result.map(r => [r.oid, r]))
  const mappedBuiltins = Object.entries(pgp.pg.types.builtins).map(([name, oid]) => ({
    ...oidToTypname[oid],
    oid,
    name,
  }))

  expect(mappedBuiltins).toMatchInlineSnapshot(`
    [
      {
        "name": "BOOL",
        "oid": 16,
        "regtype": "boolean",
        "typname": "bool",
      },
      {
        "name": "BYTEA",
        "oid": 17,
        "regtype": "bytea",
        "typname": "bytea",
      },
      {
        "name": "CHAR",
        "oid": 18,
        "regtype": ""char"",
        "typname": "char",
      },
      {
        "name": "INT8",
        "oid": 20,
        "regtype": "bigint",
        "typname": "int8",
      },
      {
        "name": "INT2",
        "oid": 21,
        "regtype": "smallint",
        "typname": "int2",
      },
      {
        "name": "INT4",
        "oid": 23,
        "regtype": "integer",
        "typname": "int4",
      },
      {
        "name": "REGPROC",
        "oid": 24,
        "regtype": "regproc",
        "typname": "regproc",
      },
      {
        "name": "TEXT",
        "oid": 25,
        "regtype": "text",
        "typname": "text",
      },
      {
        "name": "OID",
        "oid": 26,
        "regtype": "oid",
        "typname": "oid",
      },
      {
        "name": "TID",
        "oid": 27,
        "regtype": "tid",
        "typname": "tid",
      },
      {
        "name": "XID",
        "oid": 28,
        "regtype": "xid",
        "typname": "xid",
      },
      {
        "name": "CID",
        "oid": 29,
        "regtype": "cid",
        "typname": "cid",
      },
      {
        "name": "JSON",
        "oid": 114,
        "regtype": "json",
        "typname": "json",
      },
      {
        "name": "XML",
        "oid": 142,
        "regtype": "xml",
        "typname": "xml",
      },
      {
        "name": "PG_NODE_TREE",
        "oid": 194,
        "regtype": "pg_node_tree",
        "typname": "pg_node_tree",
      },
      {
        "name": "SMGR",
        "oid": 210,
        "regtype": "pg_type[]",
        "typname": "_pg_type",
      },
      {
        "name": "PATH",
        "oid": 602,
        "regtype": "path",
        "typname": "path",
      },
      {
        "name": "POLYGON",
        "oid": 604,
        "regtype": "polygon",
        "typname": "polygon",
      },
      {
        "name": "CIDR",
        "oid": 650,
        "regtype": "cidr",
        "typname": "cidr",
      },
      {
        "name": "FLOAT4",
        "oid": 700,
        "regtype": "real",
        "typname": "float4",
      },
      {
        "name": "FLOAT8",
        "oid": 701,
        "regtype": "double precision",
        "typname": "float8",
      },
      {
        "name": "ABSTIME",
        "oid": 702,
      },
      {
        "name": "RELTIME",
        "oid": 703,
      },
      {
        "name": "TINTERVAL",
        "oid": 704,
      },
      {
        "name": "CIRCLE",
        "oid": 718,
        "regtype": "circle",
        "typname": "circle",
      },
      {
        "name": "MACADDR8",
        "oid": 774,
        "regtype": "macaddr8",
        "typname": "macaddr8",
      },
      {
        "name": "MONEY",
        "oid": 790,
        "regtype": "money",
        "typname": "money",
      },
      {
        "name": "MACADDR",
        "oid": 829,
        "regtype": "macaddr",
        "typname": "macaddr",
      },
      {
        "name": "INET",
        "oid": 869,
        "regtype": "inet",
        "typname": "inet",
      },
      {
        "name": "ACLITEM",
        "oid": 1033,
        "regtype": "aclitem",
        "typname": "aclitem",
      },
      {
        "name": "BPCHAR",
        "oid": 1042,
        "regtype": "character",
        "typname": "bpchar",
      },
      {
        "name": "VARCHAR",
        "oid": 1043,
        "regtype": "character varying",
        "typname": "varchar",
      },
      {
        "name": "DATE",
        "oid": 1082,
        "regtype": "date",
        "typname": "date",
      },
      {
        "name": "TIME",
        "oid": 1083,
        "regtype": "time without time zone",
        "typname": "time",
      },
      {
        "name": "TIMESTAMP",
        "oid": 1114,
        "regtype": "timestamp without time zone",
        "typname": "timestamp",
      },
      {
        "name": "TIMESTAMPTZ",
        "oid": 1184,
        "regtype": "timestamp with time zone",
        "typname": "timestamptz",
      },
      {
        "name": "INTERVAL",
        "oid": 1186,
        "regtype": "interval",
        "typname": "interval",
      },
      {
        "name": "TIMETZ",
        "oid": 1266,
        "regtype": "time with time zone",
        "typname": "timetz",
      },
      {
        "name": "BIT",
        "oid": 1560,
        "regtype": "bit",
        "typname": "bit",
      },
      {
        "name": "VARBIT",
        "oid": 1562,
        "regtype": "bit varying",
        "typname": "varbit",
      },
      {
        "name": "NUMERIC",
        "oid": 1700,
        "regtype": "numeric",
        "typname": "numeric",
      },
      {
        "name": "REFCURSOR",
        "oid": 1790,
        "regtype": "refcursor",
        "typname": "refcursor",
      },
      {
        "name": "REGPROCEDURE",
        "oid": 2202,
        "regtype": "regprocedure",
        "typname": "regprocedure",
      },
      {
        "name": "REGOPER",
        "oid": 2203,
        "regtype": "regoper",
        "typname": "regoper",
      },
      {
        "name": "REGOPERATOR",
        "oid": 2204,
        "regtype": "regoperator",
        "typname": "regoperator",
      },
      {
        "name": "REGCLASS",
        "oid": 2205,
        "regtype": "regclass",
        "typname": "regclass",
      },
      {
        "name": "REGTYPE",
        "oid": 2206,
        "regtype": "regtype",
        "typname": "regtype",
      },
      {
        "name": "UUID",
        "oid": 2950,
        "regtype": "uuid",
        "typname": "uuid",
      },
      {
        "name": "TXID_SNAPSHOT",
        "oid": 2970,
        "regtype": "txid_snapshot",
        "typname": "txid_snapshot",
      },
      {
        "name": "PG_LSN",
        "oid": 3220,
        "regtype": "pg_lsn",
        "typname": "pg_lsn",
      },
      {
        "name": "PG_NDISTINCT",
        "oid": 3361,
        "regtype": "pg_ndistinct",
        "typname": "pg_ndistinct",
      },
      {
        "name": "PG_DEPENDENCIES",
        "oid": 3402,
        "regtype": "pg_dependencies",
        "typname": "pg_dependencies",
      },
      {
        "name": "TSVECTOR",
        "oid": 3614,
        "regtype": "tsvector",
        "typname": "tsvector",
      },
      {
        "name": "TSQUERY",
        "oid": 3615,
        "regtype": "tsquery",
        "typname": "tsquery",
      },
      {
        "name": "GTSVECTOR",
        "oid": 3642,
        "regtype": "gtsvector",
        "typname": "gtsvector",
      },
      {
        "name": "REGCONFIG",
        "oid": 3734,
        "regtype": "regconfig",
        "typname": "regconfig",
      },
      {
        "name": "REGDICTIONARY",
        "oid": 3769,
        "regtype": "regdictionary",
        "typname": "regdictionary",
      },
      {
        "name": "JSONB",
        "oid": 3802,
        "regtype": "jsonb",
        "typname": "jsonb",
      },
      {
        "name": "REGNAMESPACE",
        "oid": 4089,
        "regtype": "regnamespace",
        "typname": "regnamespace",
      },
      {
        "name": "REGROLE",
        "oid": 4096,
        "regtype": "regrole",
        "typname": "regrole",
      },
    ]
  `)

  expect(pgp.pg.types.builtins).toMatchInlineSnapshot(`
    {
      "ABSTIME": 702,
      "ACLITEM": 1033,
      "BIT": 1560,
      "BOOL": 16,
      "BPCHAR": 1042,
      "BYTEA": 17,
      "CHAR": 18,
      "CID": 29,
      "CIDR": 650,
      "CIRCLE": 718,
      "DATE": 1082,
      "FLOAT4": 700,
      "FLOAT8": 701,
      "GTSVECTOR": 3642,
      "INET": 869,
      "INT2": 21,
      "INT4": 23,
      "INT8": 20,
      "INTERVAL": 1186,
      "JSON": 114,
      "JSONB": 3802,
      "MACADDR": 829,
      "MACADDR8": 774,
      "MONEY": 790,
      "NUMERIC": 1700,
      "OID": 26,
      "PATH": 602,
      "PG_DEPENDENCIES": 3402,
      "PG_LSN": 3220,
      "PG_NDISTINCT": 3361,
      "PG_NODE_TREE": 194,
      "POLYGON": 604,
      "REFCURSOR": 1790,
      "REGCLASS": 2205,
      "REGCONFIG": 3734,
      "REGDICTIONARY": 3769,
      "REGNAMESPACE": 4089,
      "REGOPER": 2203,
      "REGOPERATOR": 2204,
      "REGPROC": 24,
      "REGPROCEDURE": 2202,
      "REGROLE": 4096,
      "REGTYPE": 2206,
      "RELTIME": 703,
      "SMGR": 210,
      "TEXT": 25,
      "TID": 27,
      "TIME": 1083,
      "TIMESTAMP": 1114,
      "TIMESTAMPTZ": 1184,
      "TIMETZ": 1266,
      "TINTERVAL": 704,
      "TSQUERY": 3615,
      "TSVECTOR": 3614,
      "TXID_SNAPSHOT": 2970,
      "UUID": 2950,
      "VARBIT": 1562,
      "VARCHAR": 1043,
      "XID": 28,
      "XML": 142,
    }
  `)
})
