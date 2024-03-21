import {SQLAutocomplete, SQLDialect} from 'sql-autocomplete'
import {test, expect} from 'vitest'
import * as wsql from 'websql-autocomplete'
import {parsePostgreSqlQueryWithCursor} from '../src/packlets/autocomplete/websql-autocomplete-lib'

const parse = (query: string) => parsePostgreSqlQueryWithCursor(query.replaceAll('\n', ' '))

test('table suggestion', async () => {
  expect(parse('select * from myt|')).toMatchInlineSnapshot(`
    {
      "errors": [],
      "suggestAggregateFunctions": true,
      "suggestDatabases": false,
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
      "suggestRoles": false,
      "suggestSchemas": false,
      "suggestSequences": false,
      "suggestTemplates": false,
      "suggestTriggers": false,
      "suggestViewsOrTables": "ALL",
    }
  `)
})

test('column suggestions', async () => {
  const result = parse(`
    with foo as (
        select a, b from table1
    )
    select |
    from foo
  `)

  expect(result).toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "endColumn": 77,
          "endLine": 1,
          "message": "no viable alternative at input 'with foo as (         select a, b from table1     )     select      from'",
          "startColumn": 73,
          "startLine": 1,
        },
      ],
      "suggestAggregateFunctions": true,
      "suggestColumns": {
        "tables": [
          {
            "alias": undefined,
            "name": "foo",
          },
        ],
      },
      "suggestDatabases": false,
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
        {
          "value": "FALSE",
        },
        {
          "value": "NULL",
        },
        {
          "value": "CASE",
        },
        {
          "value": "ROW",
        },
        {
          "value": "ALL",
        },
        {
          "value": "DISTINCT",
        },
        {
          "value": "INTO",
        },
      ],
      "suggestRoles": false,
      "suggestSchemas": false,
      "suggestSequences": false,
      "suggestTemplates": false,
      "suggestTriggers": false,
      "suggestViewsOrTables": undefined,
    }
  `)
})

test('websql-autocomplete', async () => {
  const parseWithoutCursor = wsql.parsePostgreSqlQueryWithoutCursor
  expect(parseWithoutCursor('select')).toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "endColumn": 11,
          "endLine": 1,
          "message": "no viable alternative at input 'select'",
          "startColumn": 6,
          "startLine": 1,
        },
      ],
    }
  `)
})

test('sql-autocomplete', async () => {
  const a = new SQLAutocomplete(SQLDialect.PLpgSQL, ['myDatabaseTableName'], ['aColumnName'])

  expect(a.autocomplete(`select * fr`)).toMatchInlineSnapshot(`
    [
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "FROM",
      },
    ]
  `)

  expect(a.autocomplete('select * from my')).toMatchInlineSnapshot(`
    [
      AutocompleteOption {
        "optionType": "TABLE",
        "value": "myDatabaseTableName",
      },
    ]
  `)

  expect(a.autocomplete('select a')).toMatchInlineSnapshot(`
    [
      AutocompleteOption {
        "optionType": "COLUMN",
        "value": "aColumnName",
      },
      AutocompleteOption {
        "optionType": "TABLE",
        "value": null,
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ALL",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ANY",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ALIGNMENT",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ALIAS",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ASSERT",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ABORT",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ABSOLUTE",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ACCESS",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ACTION",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ADD",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ADMIN",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "AFTER",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "AGGREGATE",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ALSO",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ALTER",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ALWAYS",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ASSERTION",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ASSIGNMENT",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "AT",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ATTACH",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ATTRIBUTE",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "AUTHORIZATION",
      },
      AutocompleteOption {
        "optionType": "KEYWORD",
        "value": "ARRAY",
      },
    ]
  `)
})
