import * as prettier from 'prettier'
import * as sqlPlugin from 'prettier-plugin-sql-cst'

export const formatSql = async (sql: string): Promise<string> => {
  try {
    sql = await prettier.format(sql, {
      filepath: 'sql.sql',
      parser: 'postgresql',
      sqlKeywordCase: 'lower',
      plugins: [
        {
          ...sqlPlugin,
          options: {
            ...sqlPlugin.options,
          },
          languages: [],
        } satisfies typeof sqlPlugin,
      ],
    })
  } catch {
    //
  }

  return sql
}