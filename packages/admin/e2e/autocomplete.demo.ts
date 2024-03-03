import {appUrl, demo} from './config'
import {test, dedent} from './helpers'

test('autocomplete', async ({page, cell}) => {
  await page.goto(appUrl)
  const delay = demo?.typingDelay
  const autocomplete = async (text: string) => {
    text = dedent(text)
    await page.locator('.cm-line').nth(0).click()
    await page.keyboard.press('Meta+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(text, {delay})
    await page.keyboard.press('Meta+Space')
  }

  await autocomplete('select * from pro')
  await page.locator('.cm-completionLabel:has-text("products")').click()
  await page.keyboard.type(' where price < 250', {delay})
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+Enter')

  await page.locator(cell(2, 2), {hasText: 'banana'}).waitFor()

  if (demo) await new Promise(r => setTimeout(r, 2000))
})
