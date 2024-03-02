/* eslint-disable no-empty-pattern */
import {test as base} from '@playwright/test'

type Extensions = {
  execute: (query: string) => Promise<void>
  cell: (row: number, col: number) => string
}

export const test = base.extend<Extensions>({
  execute: async ({page}, use) => {
    await use(async query => {
      query = dedent(query)
      await page.locator('.cm-line').nth(0).click()
      await page.keyboard.press('Meta+A')
      await page.keyboard.press('Backspace')
      await page.keyboard.type(query)
      await page.keyboard.press('Meta+Enter')
    })
  },
  cell: async ({}, use) => {
    await use((row, col) => {
      return `details[open] .reactgrid [data-cell-rowidx="${row}"][data-cell-colidx="${col}"]`
    })
  },
})

export function dedent(query: string): string {
  return query.startsWith('\n')
    ? query
        .trimEnd()
        .slice(1)
        .split('\n')
        .map(s => s.replace(/^\n( *)/.exec(query)![1], ''))
        .join('\n')
    : query
}
