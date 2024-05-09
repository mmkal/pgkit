import {STORAGE_STATE, adminConnectionString, apiUrl, appUrl, connectionString} from './config'
import {test} from './helpers'

test('seed', async ({page, execute}) => {
  await page.goto(appUrl)
  await page.locator('[data-component="logo"]').waitFor()

  await page.getByRole('button', {name: 'Open settings'}).click()

  page.once('dialog', dialog => dialog.accept('connection-string'))
  await page.getByRole('button', {name: 'Add to headers'}).click()
  await page.getByLabel('headers.connection-string').fill(adminConnectionString)
  await page.getByLabel('apiUrl').fill(apiUrl)
  await page.reload()

  await page.getByRole('button', {name: 'Open sql'}).click()

  await execute(`select 'hello' as abc`)
  await page.locator('details[open] .reactgrid').waitFor()
  await page.locator('.reactgrid [data-cell-rowidx="1"][data-cell-colidx="1"]:has-text("hello")').waitFor()

  await page.getByRole('button', {name: 'Open settings'}).click()
  await page.getByLabel('headers.connection-string').fill(connectionString)
  await page.reload()

  await page.getByRole('button', {name: 'Open sql'}).click()
  await execute(`
    delete from products;

    insert into products

      (product_no, name, price)
    values

      (1, 'apple', 100),
      (2, 'banana', 200),
      (3, 'carrot', 300);

    select * from products where price > 150;
  `)
  await page.locator('details[open] .reactgrid').waitFor()
  await page.locator('.rg-cell:has-text("banana")').waitFor()

  await page.context().storageState({path: STORAGE_STATE})
})
