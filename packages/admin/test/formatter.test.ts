/* eslint-disable @typescript-eslint/no-unused-vars */
import * as pgAst from 'pgsql-ast-parser'
import {expect, test} from 'vitest'

expect.addSnapshotSerializer({
  test: Boolean,
  print: val => JSON.stringify(val, null, 2),
})

const format = (input: string) => {
  const [ast] = pgAst.parse(input, {locationTracking: true})
  const getChunks = (thing: {}) => {
    const chunks: Array<{start: number; end: number; original: string; isLeaf: boolean; indent: number}> = []
    const indents = new Map<any, number>()
    const json = JSON.stringify(thing, function (key, _value) {
      const parentIndent = indents.get(this) || 0
      const indent = Array.isArray(_value) ? parentIndent : parentIndent + 1
      indents.set(_value, indent)
      if (key === '_location') {
        const value = _value as {start: number; end: number}
        // console.log({key, value, thiss: this})
        const {_location, ...rest} = this
        const isLeaf = !JSON.stringify(rest).includes('_location')
        const chunk = {...value, isLeaf, indent, original: input.slice(value.start, value.end)}
        // console.dir({chunk, thiss: this}, {depth: 100})
        chunks.push(chunk)
      }

      return _value
    })
    return chunks
  }

  type TreeNode = {
    depth: number
    text: string
    children: TreeNode[]
  }
  const positionalTree = (thing: any, depth = 0): TreeNode => {
    const location = thing?._location as {start: number; end: number}
    if (Array.isArray(thing)) {
      return {
        depth,
        text: '',
        children: thing.map(t => positionalTree(t, depth + 1)),
      }
    }

    const isLeaf = !JSON.stringify(thing)
      .replaceAll(`"_location":${JSON.stringify(location)}`, '')
      .includes('_location')

    if (isLeaf) {
      return {
        depth,
        text: input.slice(location.start, location.end),
        children: [],
      }
    }

    if (thing && typeof thing === 'object') {
      const children = Object.entries(thing as {}).map(([k, v]) => {
        const childNode = positionalTree(v, depth + 1)
        return childNode
      })
    }

    return thing
  }

  return getChunks(ast).filter(c => c.isLeaf)
}

test('ast parser', async () => {
  const query = `
    select product_no,
    name
    from 
     products
  `

  const ast = pgAst.parse(query, {locationTracking: true})

  expect(format(query)).toMatchInlineSnapshot(`
    [
      {
        "start": 12,
        "end": 22,
        "isLeaf": true,
        "indent": 4,
        "original": "product_no"
      },
      {
        "start": 28,
        "end": 32,
        "isLeaf": true,
        "indent": 4,
        "original": "name"
      },
      {
        "start": 48,
        "end": 56,
        "isLeaf": true,
        "indent": 4,
        "original": "products"
      }
    ]
  `)

  expect(ast).toEqual([
    {
      columns: [
        {
          expr: {
            type: 'ref',
            name: 'product_no',
            _location: {
              start: 12,
              end: 22,
            },
          },
          _location: {
            start: 12,
            end: 22,
          },
        },
        {
          expr: {
            type: 'ref',
            name: 'name',
            _location: {
              start: 28,
              end: 32,
            },
          },
          _location: {
            start: 28,
            end: 32,
          },
        },
      ],
      _location: {
        start: 5,
        end: 56,
      },
      from: [
        {
          type: 'table',
          name: {
            name: 'products',
            _location: {
              start: 48,
              end: 56,
            },
          },
          _location: {
            start: 48,
            end: 56,
          },
        },
      ],
      type: 'select',
    },
  ])
})
