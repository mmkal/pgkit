import {createClient} from '../src/client'
import {test, expect} from 'vitest'

test('createClient', async () => {
  expect(createClient).toBeDefined()
})
