/* eslint-disable no-console */
import {createClient, sql} from '@pgkit/client'
import * as fs from 'fs'
import * as path from 'path'
import * as quicktype from 'quicktype-core'
import {PostgreSQL, SqlbagS} from '../src'

const main = async () => {
  const samples = [] as Array<{}>
  const admin = createClient('postgresql://postgres:postgres@localhost:5432/postgres')

  const fixtures = fs.readdirSync(path.join(__dirname, '../../migra/test/FIXTURES')).flatMap(name => [
    {variant: 'a', name},
    {variant: 'b', name},
  ])
  for (const {name, variant} of fixtures) {
    const sqlFile = path.join(__dirname, '../../migra/test/FIXTURES', name, variant + '.sql')
    const dbName = `schemainspect_test_${name}_${variant}`

    await admin.query(sql`drop database if exists ${sql.identifier([dbName])}`)
    await admin.query(sql`create database ${sql.identifier([dbName])}`)

    const connectionString = admin.connectionString().replace(/\/\w+$/, `/${dbName}`)

    const client = createClient(connectionString)
    await client.query(sql.raw(await fs.promises.readFile(sqlFile, 'utf8')))

    const bag = new SqlbagS(connectionString)
    const inspector = await PostgreSQL.create(bag)

    samples.push(inspector.queryResults)

    await client.end()
  }

  const jsonInput = quicktype.jsonInputForTargetLanguage('typescript')
  await jsonInput.addSource({
    name: 'Queries',
    samples: samples.map(s => JSON.stringify(s, null, 2)),
  })
  const inputData = new quicktype.InputData()
  inputData.addInput(jsonInput)
  const typescript = await quicktype.quicktype({
    inputData,
    lang: 'typescript',
    rendererOptions: {
      'just-types': true,
      'prefer-unions': true,
    },
  })

  const target = 'src/types.ts'
  const code = [
    '/* eslint-disable */',
    `// generated by ${path.relative(path.dirname(target), __filename)} - do not edit manually`,
    '', //
    ...typescript.lines,
  ].join('\n')

  await fs.promises.writeFile(target, code)
}

if (require.main === module) {
  void main()
}