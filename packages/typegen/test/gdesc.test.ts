import * as path from 'path'
import {fsSyncer} from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import * as jsYaml from 'js-yaml'
import * as dedent from 'dedent'

expect.addSnapshotSerializer({
  test: () => true,
  print: val => jsYaml.safeDump(val),
})

test('write types', async () => {
  const syncer = fsSyncer(path.join(__dirname, 'fixtures/gdesc/write'), {
    'queries.ts': dedent`
      import {sql} from './generated'

      export const q1 = sql.Q1\`select 1 as a, 2 as b\`
      export const q2 = sql.Q2\`select 'foo' as f, 'bar' as b\`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber({
    rootDir: syncer.baseDir,
  })

  expect(syncer.read() as any).toMatchInlineSnapshot(`
    generated:
      index.ts: |
        import * as slonik from "slonik";
        import * as types from "./types";

        export { types };

        export interface GenericSqlTaggedTemplateType<T> {
          <U = T>(
            template: TemplateStringsArray,
            ...vals: slonik.ValueExpressionType[]
          ): slonik.TaggedTemplateLiteralInvocationType<U>;
        }

        export type SqlType = typeof slonik.sql & {
          /**
           * Template tag for queries returning \`Q1\`
           *
           * @example
           * \`\`\`
           * await connection.query(sql.Q1\`
           *   select 1 as a, 2 as b
           * \`)
           * \`\`\`
           */
          Q1: GenericSqlTaggedTemplateType<types.Q1>;
          /**
           * Template tag for queries returning \`Q2\`
           *
           * @example
           * \`\`\`
           * await connection.query(sql.Q2\`
           *   select 'foo' as f, 'bar' as b
           * \`)
           * \`\`\`
           */
          Q2: GenericSqlTaggedTemplateType<types.Q2>;
        };

        /**
         * Wrapper for \`slonik.sql\` with properties for types \`Q1\`, \`Q2\`
         *
         * @example
         * \`\`\`
         * const result = await connection.query(sql.Q1\`
         *  select 1 as a, 2 as b
         * \`)
         *
         * result.rows.forEach(row => {
         *   // row is strongly-typed
         * })
         * \`\`\`
         *
         * It can also be used as a drop-in replacement for \`slonik.sql\`, the type tags are optional:
         *
         * @example
         * \`\`\`
         * const result = await connection.query(sql\`
         *   select foo, bar from baz
         * \`)
         *
         * result.rows.forEach(row => {
         *   // row is not strongly-typed, but you can still use it!
         * })
         * \`\`\`
         */
        export const sql: SqlType = Object.assign(
          // wrapper function for \`slonik.sql\`
          (...args: Parameters<typeof slonik.sql>): ReturnType<typeof slonik.sql> => {
            return slonik.sql(...args);
          },
          // attach helpers (\`sql.join\`, \`sql.unnest\` etc.) to wrapper function
          slonik.sql,
          // attach type tags
          {
            Q1: slonik.sql,
            Q2: slonik.sql,
          }
        );
      types:
        Q1.ts: |
          /**
           * - query: \`select 1 as a, 2 as b\`
           */
          export interface Q1 {
            /** postgres type: integer */
            a: number;
            /** postgres type: integer */
            b: number;
          }
        Q2.ts: |
          /**
           * - query: \`select 'foo' as f, 'bar' as b\`
           */
          export interface Q2 {
            /** postgres type: text */
            f: string;
            /** postgres type: text */
            b: string;
          }
      types.ts: |
        import { Q1 } from "./types/Q1";
        import { Q2 } from "./types/Q2";

        export { Q1 };
        export { Q2 };
    queries.ts: |-
      import {sql} from './generated'

      export const q1 = sql.Q1\`select 1 as a, 2 as b\`
      export const q2 = sql.Q2\`select 'foo' as f, 'bar' as b\`

  `)
}, 20000)

test('edit before write', async () => {
  const syncer = fsSyncer<any>(path.join(__dirname, 'fixtures/gdesc/edit'), {
    'queries.ts': dedent`
      import {sql} from './generated'

      export const q1 = sql.Q1\`select 1 as a, 2 as b\`
      export const q2 = sql.Q2\`select 'foo' as f, 'bar' as b\`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber({
    glob: ['./*.ts', {cwd: syncer.baseDir}],
    writeTypes: files => {
      Object.entries(files).forEach(([typeName, queries]) => {
        queries.forEach(query => {
          query.fields.forEach(field => {
            if (typeName === 'Q2' && field.gdesc === 'text' && field.name === 'f') {
              field.typescript += ' & { _brand: "foo" }'
            }
          })
        })
      })
      return gdesc.defaultWriteTypes(path.join(syncer.baseDir, 'generated'))(files)
    },
  })

  expect((syncer.read() as any).generated.types).toMatchInlineSnapshot(`
    Q1.ts: |
      /**
       * - query: \`select 1 as a, 2 as b\`
       */
      export interface Q1 {
        /** postgres type: integer */
        a: number;
        /** postgres type: integer */
        b: number;
      }
    Q2.ts: |
      /**
       * - query: \`select 'foo' as f, 'bar' as b\`
       */
      export interface Q2 {
        /** postgres type: text */
        f: string & { _brand: "foo" };
        /** postgres type: text */
        b: string;
      }

  `)
}, 10000)
