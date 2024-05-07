import {Queryable} from '@pgkit/client'
import {readFileSync} from 'fs'

export const connection_from_s_or_c = (s_or_c: Queryable) => {
  // deviating from python: I don't understand the crazy way they build a sqlbag object so just demand one as an input and return in
  // return s_or_c.engine ? s_or_c : s_or_c.connection?.() || s_or_c
  return s_or_c
}

export class AutoRepr {
  toString(): string {
    const cname = this.constructor.name
    const vals = []

    for (const k of Object.keys(this).sort()) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const v = this[k]

      if (!k.startsWith('_') && typeof v !== 'function') {
        const attr = `${k}=${JSON.stringify(v)}`
        vals.push(attr)
      }
    }

    return `${cname}(${vals.join(', ')})`
  }

  equals(other: any): boolean {
    return this.toString() === other.toString()
  }

  notEquals(other: any): boolean {
    return !this.equals(other)
  }
}

export const unquoted_identifier = (identifier: string, schema?: string, identity_arguments?: string) => {
  if (!identifier && schema) {
    return schema
  }

  let s = `${identifier}`
  if (schema) {
    s = `${schema}.${s}`
  }

  if (identity_arguments) {
    s += `(${identity_arguments})`
  }

  return s
}

export const canSkipQuotes = (identifier: string) => /^[_a-z]+$/.test(identifier)

// deviation: the original `schemainstpect` project has a single `quoted_identifier` function that receives schema and identifier.
// this separates out the quoting from the schema part, because some migrations assume that the schema is inferred from the search path
// (e.g. applications that run migrations multiple times on different schemas - it's important *not* to include the hard-coded schema in those cases)
// so, `quoted_identifier` now *must* specify its schema. This avoids usage like `${quoted_identifier('myschema')}.${quoted_identifier('mytable')}`
// which is used in some places in the original project. Instead, it's now `${quoted_identifier('mytable', 'myschema')}` so that the schema is always explicit.
// that way, we can check against a configured search path to omit the schema.
export const quotify = (identifier: string) => identifier.replaceAll(`"`, `""`)

export const quoted_identifier = (
  identifier: string,
  schema: string,
  // identity_arguments?: string, // deviation: removed to avoid overloads (see above). only used two places, they just have to do it manually
): string => {
  // todo: use async storage for search path, not an env var.
  const searchPathParts = process.env.SCHEMAINSPECT_SEARCH_PATH?.split(',') || []
  if (searchPathParts.includes(schema)) {
    // console.log('shortcut', {schema, searchPathParts})
    return quotify(identifier)
  }

  if (!identifier && schema) {
    return `"${schema.replaceAll(`"`, '""')}"`
  }

  let s = `"${identifier.replaceAll(`"`, `""`)}"`
  if (schema) {
    s = `"${schema.replaceAll(`"`, `""`)}".${s}`
  }

  // deviation: removed, see above
  // if (identity_arguments) {
  //   s += `(${identity_arguments})`
  // }

  return s
}

// deviation: relative file stuff, call stacks, file opening are sufficiently different in nodejs vs python that reimplementing in `getResourceText` is better than trying to make these work
// export const external_caller = () => {
//   const _i = new Error('test').stack.split('\n')[3]
//   return _i
// }

// export const resource_stream = (subpath: any) => {
//   const module_name = external_caller()
//   return pkg_resource_stream(module_name, subpath)
// }

// export const resource_text = (subpath: string) => {
//   const stream = resource_stream(subpath)
//   return stream.toString('utf8')
// }

export const getResourceText = (dirname: string) => {
  return (filename: string) => {
    try {
      return `--name:${filename}\n` + readFileSync(`${dirname}/${filename}`).toString()
    } catch (e) {
      throw new Error(`Error reading file ${filename} from ${dirname}: ${e as string}`, {cause: e})
    }
  }
}
