/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {maxBy} from './util'

export const transpose = (in_data: any[]) => {
  const array = Array.from({length: maxBy(in_data, x => x.length).length})
  return array.map((_, i) => in_data.map(x => x[i]))
}

export const rows_to_table = (rows: any[][], {sep = ' '} = {}) => {
  const rows_out = rows.map(row => row.join(sep))
  return '\n' + rows_out.join('\n') + '\n'
}

export const t = (_rows: Array<Record<string, any>>, {sep = ' ', markdown = true} = {}) => {
  const keys = Object.keys(_rows[0])
  const rows = _rows.map(row => keys.map(key => row[key]))

  if (markdown) {
    sep = ' | '
  }

  rows.unshift(keys)

  const columns = transpose(rows)
  const widths = columns.map(col => maxBy(col, x => x.length).length as number)

  const rows_out = rows.map(row => {
    return row.map((cell, i) => cell.padEnd(widths[i])).join(sep)
  })

  if (markdown) {
    const _spacer = (width: number, centered = false, right = false) => {
      const start = centered ? ':' : ' '
      const end = centered || right ? ':' : ' '
      return start + '*'.repeat(width) + end
    }

    rows_out.splice(1, 0, widths.map(w => '-'.repeat(w)).join(sep))
  }

  return rows_out.join('\n')
}
