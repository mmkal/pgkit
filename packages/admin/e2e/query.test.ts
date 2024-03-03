import {appUrl} from './config'
import {test} from './helpers'

test.afterEach(async ({execute}) => {
  await execute('')
})

test('query', async ({page, execute, cell}) => {
  await page.goto(appUrl)

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
  await page.locator(cell(2, 2), {hasText: 'carrot'}).waitFor()

  await execute('')
})
