import {ColumnInfo, Inspected} from '@pgkit/schemainspect'
import {test, expect} from 'vitest'
import {Suggestion} from '../src/packlets/autocomplete/suggest'
import {suggest, parse} from './suggest-helper'

const maxArrayLength = 10

expect.addSnapshotSerializer({
  test: val => Array.isArray(val) && val[0]?.source,
  print: (val: any) =>
    (val as Suggestion[])
      .map((s: any) => `${s.text} - ${s.detail || s.type}`)
      .slice(0, maxArrayLength)
      .concat(val.length > maxArrayLength ? [`...${val.length - maxArrayLength} more`] : [])
      .join('\n'),
})

expect.addSnapshotSerializer({
  test: val => Array.isArray(val) && !val[0]?.source && val.length > maxArrayLength,
  print: (val, print) => print((val as any[]).slice(0, maxArrayLength - 1).concat(['...'])),
})

expect.addSnapshotSerializer({
  test: val => val instanceof Inspected,
  print: (val: any) => `${val.constructor.name}:${(val as Inspected).name}`,
})

expect.addSnapshotSerializer({
  test: val => val instanceof ColumnInfo || typeof val?.not_null === 'boolean',
  print: (val: any) => `ColumnInfo:${(val as ColumnInfo).name}`,
})

test('select anything', async () => {
  const suggestions = suggest('select |', {explicit: true})
  expect(suggestions.find(s => s.text === '*')).toMatchInlineSnapshot(`
    {
      "detail": null,
      "source": "keyword",
      "text": "*",
      "type": "keyword",
    }
  `)
})

test('suggest w semicolon', async () => {
  expect(suggest('select * from products where pr|;')).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    price - numeric not null (table: products)
    preferred - keyword
    provider - keyword
    preceding - keyword
    prepare - keyword
    prepared - keyword
    preserve - keyword
    prior - keyword
    privileges - keyword
    ...28 more
  `)
})

test('suggest keyword', async () => {
  expect(suggest('select * fr|')).toMatchInlineSnapshot(`from - keyword`)
})

test('suggest column', async () => {
  expect(suggest('select | from products')).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    name - text nullable (table: products)
    price - numeric not null (table: products)
    x - integer nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
    changed - function i,t -> a,c
    newfunc - function i,t -> a,c
    array_agg - aggregate
    array_agg - aggregate
    ...90 more
  `)
})

test('suggest any(...), all(...) etc.', async () => {
  expect(suggest('select 1 = an|')).toMatchInlineSnapshot(`
    any - keyword
    changed - function i,t -> a,c
    bit_and - aggregate
    bool_and - aggregate
    newfunc - function i,t -> a,c
    array_agg - aggregate
    array_agg - aggregate
    dimension - aggregate
    avg - aggregate
    average - aggregate
    ...14 more
  `)
})

test('suggest unaliased column w dot', async () => {
  expect(suggest('select products.| from products')).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    name - text nullable (table: products)
    price - numeric not null (table: products)
    x - integer nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
  `)
})

test('suggest column w dot and partial field', async () => {
  expect(suggest('select p.pr| from products p')).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    price - numeric not null (table: products)
  `)
})

test('suggest column w dot', async () => {
  expect(suggest('select p.| from products p')).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    name - text nullable (table: products)
    price - numeric not null (table: products)
    x - integer nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
  `)
})

test('suggest column from join', async () => {
  const query = `
    select |
    from products p
    join order_items i on p.product_no = o.product_no
    join orders o on o.order_id = i.order_id
  `
  expect(suggest(query)).toMatchInlineSnapshot(`
    p.product_no - integer not null (table: products)
    i.product_no - integer not null (table: order_items)
    name - text nullable (table: products)
    price - numeric not null (table: products)
    x - integer nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
    i.order_id - integer not null (table: order_items)
    o.order_id - integer not null (table: orders)
    quantity - integer nullable (table: order_items)
    ...90 more
  `)
})

test('suggest column of view', async () => {
  expect(suggest('select | from products')).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    name - text nullable (table: products)
    price - numeric not null (table: products)
    x - integer nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
    changed - function i,t -> a,c
    newfunc - function i,t -> a,c
    array_agg - aggregate
    array_agg - aggregate
    ...90 more
  `)
})

test('suggest join', async () => {
  const query = `select * from products p join order_items o on p|`

  expect(suggest(query)).toMatchInlineSnapshot(`
    p.product_no - integer not null (table: products)
    o.product_no - integer not null (table: order_items)
    price - numeric not null (table: products)
    passedbyvalue - keyword
    path - keyword
    permissive - keyword
    plain - keyword
    preferred - keyword
    provider - keyword
    perform - keyword
    ...44 more
  `)
})

test('suggest column from join w aliases', async () => {
  const query = `
    select *
    from products p
    join orders o on p.product_no = o.product_no
    where p|
  `
  expect(suggest(query)).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    price - numeric not null (table: products)
    passedbyvalue - keyword
    path - keyword
    permissive - keyword
    plain - keyword
    preferred - keyword
    provider - keyword
    perform - keyword
    parallel - keyword
    ...43 more
  `)
})

test('suggest column w prefix', async () => {
  expect(suggest('select n| from products')).toMatchInlineSnapshot(`
    name - text nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
    newfunc - function i,t -> a,c
    not - keyword
    number_literal - keyword
    null - keyword
    negator - keyword
    nobypassrls - keyword
    nocreatedb - keyword
    ...44 more
  `)
})

test(`only suggest random keywords if explicit`, async () => {
  expect(suggest('select * from products |')).toMatchInlineSnapshot(`[]`)
  expect(suggest('select * from products |', {explicit: true})).toMatchInlineSnapshot(`
    tablesample - keyword
    as - keyword
    quotedidentifier - keyword
    alignment - keyword
    basetype - keyword
    buffers - keyword
    bypassrls - keyword
    canonical - keyword
    category - keyword
    collatable - keyword
    ...90 more
  `)
})

test('insert', async () => {
  const query = `insert into products (product_no, name) valu|`

  expect(suggest(query)).toMatchInlineSnapshot(`values - keyword`)
})

test('where', async () => {
  const query = `
    select * from products
    where |
  `
  expect(suggest(query)).toMatchInlineSnapshot(`
    product_no - integer not null (table: products)
    name - text nullable (table: products)
    price - numeric not null (table: products)
    x - integer nullable (table: products)
    newcolumn - text nullable (table: products)
    newcolumn2 - interval nullable (table: products)
    changed - function i,t -> a,c
    newfunc - function i,t -> a,c
    array_agg - aggregate
    array_agg - aggregate
    ...90 more
  `)
})

test('insert returning', async () => {
  const query = `insert into products (product_no, name) values (1, 'test') retur|`

  expect(suggest(query)).toMatchInlineSnapshot(`returning - keyword`)
  expect(suggest(query, {explicit: true})).toMatchInlineSnapshot(`
    returning - keyword
    intersect - keyword
    except - keyword
    union - keyword
    order - keyword
    limit - keyword
    fetch - keyword
    offset - keyword
    for - keyword
    on - keyword
  `)
})

test('suggest table', async () => {
  expect(suggest('select * from |')).toMatchInlineSnapshot(`
    bug - table
    change_to_logged - table
    change_to_unlogged - table
    columnless_table2 - table
    order_items - table
    orders - table
    products - table
    vvv - view
    evenbetterschema.test_table - table
    goodschema.test_table - table
    ...90 more
  `)
})

test('suggest table w schema qualifier', async () => {
  // todo: improve this
  expect(suggest('select * from public.pr|', {debug: true})).toMatchInlineSnapshot(`[]`)
})

test('suggest tables w/ name clash', async () => {
  const suggestions = suggest('select * from test_tabl|')
  expect(suggestions).toMatchInlineSnapshot(`
    evenbetterschema.test_table - table
    goodschema.test_table - table
    bug - table
    change_to_logged - table
    change_to_unlogged - table
    columnless_table2 - table
    order_items - table
    orders - table
    products - table
    vvv - view
    ...27 more
  `)
})

test('suggest column from table w/ name clash', async () => {
  const suggestColumns: typeof suggest = query => suggest(query).filter(s => s.type === 'column')
  expect(suggestColumns('select | from goodschema.test_table')).toMatchInlineSnapshot(`
    id - integer not null (table: test_table)
    name - text nullable (table: test_table)
  `)

  expect(suggestColumns('select | from evenbetterschema.test_table')).toMatchInlineSnapshot(`
    id - integer not null (table: test_table)
    name - text nullable (table: test_table)
    another_column - jsonb nullable (table: test_table)
  `)

  expect(suggestColumns('select | from "evenbetterschema"."test_table"')).toMatchInlineSnapshot(`
    id - integer not null (table: test_table)
    name - text nullable (table: test_table)
    another_column - jsonb nullable (table: test_table)
  `)
})

test('suggest function', async () => {
  expect(suggest('select * from |')).toMatchInlineSnapshot(`
    bug - table
    change_to_logged - table
    change_to_unlogged - table
    columnless_table2 - table
    order_items - table
    orders - table
    products - table
    vvv - view
    evenbetterschema.test_table - table
    goodschema.test_table - table
    ...90 more
  `)
})

test('parse cte', async () => {
  const query = `
    with foo as (
      select * from products
    )
    select |
    from foo as f
  `
  expect(parse(query)).toMatchInlineSnapshot(`
    {
      "currentWord": " ",
      "cursorified": "     with foo as (       select * from products     )     select |     from foo as f   ",
      "flatQuery": "     with foo as (       select * from products     )     select      from foo as f   ",
      "position": {
        "column": 66,
        "line": 1,
      },
      "prefix": "",
      "query": "     with foo as (       select * from products     )     select      from foo as f   ",
      "queryUpToPosition": "     with foo as (       select * from products     )     select ",
      "sqla": [
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "c",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "c",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "b",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "b",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "newcolumn2",
        },
        "...",
      ],
      "wsql": {
        "errors": [
          {
            "endColumn": 74,
            "endLine": 1,
            "message": "no viable alternative at input 'with foo as (       select * from products     )     select      from'",
            "startColumn": 70,
            "startLine": 1,
          },
        ],
        "suggestAggregateFunctions": true,
        "suggestColumnAliases": undefined,
        "suggestColumns": {
          "tables": [
            {
              "alias": "f",
              "name": "foo",
            },
          ],
        },
        "suggestFunctions": true,
        "suggestIndexes": false,
        "suggestKeywords": [
          {
            "value": "*",
          },
          {
            "value": "NOT",
          },
          {
            "value": "OPERATOR",
          },
          {
            "value": "EXISTS",
          },
          {
            "value": "ARRAY",
          },
          {
            "value": "GROUPING",
          },
          {
            "value": "UNIQUE",
          },
          {
            "value": "INTERVAL",
          },
          {
            "value": "TRUE",
          },
          "...",
        ],
        "suggestTemplates": false,
        "suggestViewsOrTables": undefined,
      },
    }
  `)
})

test('parse function call', async () => {
  expect(parse('select * from changed(|')).toMatchInlineSnapshot(`
    {
      "currentWord": "(",
      "cursorified": "select * from changed(|",
      "flatQuery": "select * from changed(",
      "position": {
        "column": 23,
        "line": 1,
      },
      "prefix": "",
      "query": "select * from changed(",
      "queryUpToPosition": "select * from changed(",
      "sqla": [
        AutocompleteOption {
          "optionType": "TABLE",
          "value": null,
        },
      ],
      "wsql": {
        "errors": [
          {
            "endColumn": 27,
            "endLine": 1,
            "message": "no viable alternative at input 'select * from changed('",
            "startColumn": 22,
            "startLine": 1,
          },
        ],
        "suggestAggregateFunctions": true,
        "suggestFunctions": true,
        "suggestIndexes": false,
        "suggestKeywords": [
          {
            "value": "*",
          },
          {
            "value": "ALL",
          },
          {
            "value": "DISTINCT",
          },
          {
            "value": "VARIADIC",
          },
          {
            "value": "NOT",
          },
          {
            "value": "OPERATOR",
          },
          {
            "value": "EXISTS",
          },
          {
            "value": "ARRAY",
          },
          {
            "value": "GROUPING",
          },
          "...",
        ],
        "suggestTemplates": false,
        "suggestViewsOrTables": "ALL",
      },
    }
  `)
})

test('parse column', async () => {
  expect(parse('select | from patient')).toMatchInlineSnapshot(`
    {
      "currentWord": " ",
      "cursorified": "select | from patient",
      "flatQuery": "select  from patient",
      "position": {
        "column": 8,
        "line": 1,
      },
      "prefix": "",
      "query": "select  from patient",
      "queryUpToPosition": "select ",
      "sqla": [
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "c",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "c",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "b",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "b",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "a",
        },
        AutocompleteOption {
          "optionType": "COLUMN",
          "value": "newcolumn2",
        },
        "...",
      ],
      "wsql": {
        "errors": [
          {
            "endColumn": 12,
            "endLine": 1,
            "message": "no viable alternative at input 'select  from'",
            "startColumn": 8,
            "startLine": 1,
          },
        ],
        "suggestAggregateFunctions": true,
        "suggestColumnAliases": undefined,
        "suggestColumns": {
          "tables": [
            {
              "alias": undefined,
              "name": "patient",
            },
          ],
        },
        "suggestFunctions": true,
        "suggestIndexes": false,
        "suggestKeywords": [
          {
            "value": "*",
          },
          {
            "value": "NOT",
          },
          {
            "value": "OPERATOR",
          },
          {
            "value": "EXISTS",
          },
          {
            "value": "ARRAY",
          },
          {
            "value": "GROUPING",
          },
          {
            "value": "UNIQUE",
          },
          {
            "value": "INTERVAL",
          },
          {
            "value": "TRUE",
          },
          "...",
        ],
        "suggestTemplates": false,
        "suggestViewsOrTables": undefined,
      },
    }
  `)
})

test('suggest table', async () => {
  expect(parse('select * from |')).toMatchInlineSnapshot(`
    {
      "currentWord": " ",
      "cursorified": "select * from |",
      "flatQuery": "select * from ",
      "position": {
        "column": 15,
        "line": 1,
      },
      "prefix": "",
      "query": "select * from ",
      "queryUpToPosition": "select * from ",
      "sqla": [
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."newfunc"(i integer, t text[])",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."changed"(i integer, t text[])",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."matvvv"",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."vvv"",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."products"",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."orders"",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."order_items"",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."columnless_table2"",
        },
        AutocompleteOption {
          "optionType": "TABLE",
          "value": ""public"."change_to_unlogged"",
        },
        "...",
      ],
      "wsql": {
        "errors": [
          {
            "endColumn": 19,
            "endLine": 1,
            "message": "no viable alternative at input 'select * from '",
            "startColumn": 14,
            "startLine": 1,
          },
        ],
        "suggestAggregateFunctions": true,
        "suggestFunctions": true,
        "suggestIndexes": false,
        "suggestKeywords": [
          {
            "value": "ONLY",
          },
          {
            "value": "ROWS",
          },
          {
            "value": "XMLTABLE",
          },
          {
            "value": "LATERAL",
          },
        ],
        "suggestTemplates": false,
        "suggestViewsOrTables": "ALL",
      },
    }
  `)
})

test('parse', async () => {
  const result = parse('select * fr|')

  expect(result).toMatchInlineSnapshot(`
    {
      "currentWord": "fr",
      "cursorified": "select * fr|",
      "flatQuery": "select * fr",
      "position": {
        "column": 12,
        "line": 1,
      },
      "prefix": "",
      "query": "select * fr",
      "queryUpToPosition": "select * fr",
      "sqla": [
        AutocompleteOption {
          "optionType": "KEYWORD",
          "value": "FROM",
        },
      ],
      "wsql": {
        "errors": [
          {
            "endColumn": 11,
            "endLine": 1,
            "message": "no viable alternative at input 'fr'",
            "startColumn": 9,
            "startLine": 1,
          },
        ],
        "suggestAggregateFunctions": false,
        "suggestFunctions": false,
        "suggestIndexes": false,
        "suggestKeywords": [
          {
            "value": "INTO",
          },
          {
            "value": "FROM",
          },
          {
            "value": "WHERE",
          },
          {
            "value": "GROUP",
          },
          {
            "value": "HAVING",
          },
          {
            "value": "WINDOW",
          },
          {
            "value": "INTERSECT",
          },
          {
            "value": "EXCEPT",
          },
          {
            "value": "UNION",
          },
          "...",
        ],
        "suggestTemplates": false,
        "suggestViewsOrTables": undefined,
      },
    }
  `)
})
