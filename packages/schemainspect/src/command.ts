// todo: emable the cli
// import meow from 'meow'
// import {S} from 'sqlbag'
// import {get_inspector} from './get'
// import {quoted_identifier} from './misc'
// import {t} from './tableformat'

// function parseArgs(args: string[]): meow.Result<any> {
//   const cli = meow(
//     `
//       Usage
//           $ my-app <input>

//       Commands
//           deps, Show inspected dependencies
//           yaml, Export schema definition as YAML

//       Options
//           --dbUrl, URL

//       Examples
//           $ my-app deps --dbUrl=postgresql://localhost:5432/mydb
//           $ my-app yaml --dbUrl=postgresql://localhost:5432/mydb
//     `,
//     {
//       flags: {
//         dbUrl: {
//           type: 'string',
//           alias: 'd',
//         },
//       },
//     },
//   )

//   return cli
// }

// async function do_deps(dbUrl: string): Promise<void> {
//   const s = new S(dbUrl)
//   const i = get_inspector(s)
//   let {deps} = i

//   const processRow = (dep: any) => {
//     const depends_on = quoted_identifier(dep.name, dep.schema, dep.identity_arguments)
//     const thing = quoted_identifier(dep.name_dependent_on, dep.schema_dependent_on, dep.identity_arguments_dependent_on)

//     return {
//       thing: `${dep.kind_dependent_on}: ${thing}`,
//       depends_on: `${dep.kind}: ${depends_on}`,
//     }
//   }

//   deps = deps.map(processRow)

//   const rows = t(deps)

//   if (rows) {
//     console.log(rows)
//   } else {
//     console.log('No dependencies found.')
//   }
// }

// async function do_yaml(dbUrl: string): Promise<void> {
//   const s = new S(dbUrl)
//   const i = get_inspector(s)
//   const defn = i.encodeable_definition()

//   const yaml = require('js-yaml')
//   const x = yaml.safeDump(defn)

//   console.log(x)
// }

// async function run(args: meow.Result<any>): Promise<void> {
//   if (args.flags.command === 'deps') {
//     await do_deps(args.flags.dbUrl)
//   } else if (args.flags.command === 'yaml') {
//     await do_yaml(args.flags.dbUrl)
//   } else {
//     throw new Error('No such command')
//   }
// }

// async function do_command(): Promise<void> {
//   const args = parseArgs(process.argv.slice(2))
//   await run(args)
//   process.exit(0)
// }

// do_command()
if (require.main === module) {
  throw new Error(`schemainspect cli not implemented yet. Use the library directly.`)
}
