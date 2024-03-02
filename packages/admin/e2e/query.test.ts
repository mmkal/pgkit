import {appUrl} from './config'
import {dedent, test} from './helpers'

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
})

test('autocomplete', async ({page, cell}) => {
  await page.goto(appUrl)
  const autocomplete = async (text: string, {delay = 0} = {}) => {
    text = dedent(text)
    await page.locator('.cm-line').nth(0).click()
    await page.keyboard.press('Meta+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(text, {delay})
    await page.keyboard.press('Meta+Space')
  }

  await autocomplete('select * from pro')
  await page.locator('.cm-completionLabel:has-text("products")').click()
  await page.keyboard.press('Meta+Enter')

  await page.locator(cell(2, 2), {hasText: 'banana'}).waitFor()
})
