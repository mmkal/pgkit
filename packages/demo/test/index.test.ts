process.env.POSTGRES_CONNECTION_STRING = 'postgresql://postgres:postgres@localhost:5433/postgres'

import {getApp} from '../src'
import * as supertest from 'supertest'
import {slonik, sql} from '../src/db'

describe('demo app', () => {
  const testApp = supertest(getApp())

  beforeAll(() => slonik.query(sql`delete from messages`))

  it('gets and posts messages', async () => {
    const {body: empty} = await testApp.get('/api/messages')

    expect(empty).toEqual([])

    const {
      body: {id: newMessageId},
    } = await testApp.post('/api/messages?content=abc')

    expect(newMessageId).toBeGreaterThanOrEqual(0)

    const {body: nonEmpty} = await testApp.get('/api/messages')

    expect(nonEmpty).toMatchObject([{text: 'abc'}])
  })

  it('fails sensibly for illegal input', async () => {
    const mockError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const response = await testApp.post('/api/messages?content=anillegallylongmessage1231231231231231')

    expect(response).toMatchObject({
      status: 500,
      text: `error: value too long for type character varying(20)`,
    })
    expect(mockError).toHaveBeenCalledTimes(1)
  })
})
