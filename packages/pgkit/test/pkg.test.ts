import {test, expect} from 'vitest'
import {createClient} from '../src/client'

test('createClient', async () => {
  expect(createClient).toBeDefined()
})
