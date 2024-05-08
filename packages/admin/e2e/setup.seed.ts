import {STORAGE_STATE, adminConnectionString, apiUrl, appUrl, connectionString} from './config'
import {test} from './helpers'

test('seed', async ({page, execute}) => {
  await page.goto(appUrl)
  await page.locator('[data-component="logo"]').waitFor()

  await page.locator('button[role="menu"]').click()
  await page.locator('[data-header="connection-string"] input').fill(adminConnectionString)
  await page.locator('[data-setting="api-url"] input').fill(apiUrl)
  await page.keyboard.press('Escape')
  await page.locator('button[role="menu"]').click()

  await execute(`select 'hello' as abc`)
  await page.locator('details[open] .reactgrid').waitFor()
  await page.locator('.reactgrid [data-cell-rowidx="1"][data-cell-colidx="1"]:has-text("hello")').waitFor()

  //   await execute(`
  //     --no-parse
  //     drop database if exists e2e;
  //     create database e2e;
  //   `)
  //   await page.locator('details[open]:has-text("No data")').waitFor()

  await page.locator('button[role="menu"]').click()
  await page.locator('[data-header="connection-string"] input').fill(connectionString)
  await page.keyboard.press('Escape')
  await page.locator('button[role="menu"]').click()

  await execute(`select 'hello' as abc`)
  await page.locator('details[open] .reactgrid').waitFor()
  await page.locator('.reactgrid [data-cell-rowidx="1"][data-cell-colidx="1"]:has-text("hello")').waitFor()

  await page.context().storageState({path: STORAGE_STATE})
})
