import * as express from 'express'
import {slonik, sql} from './db'
import {resolve} from 'path'

export const getApp = () => {
  const app = express()

  const handleError = (res: express.Response) => (err: any) => {
    console.error(err)
    res.status(500).send(`${err}`)
  }

  app.post('/api/messages', (req, res) => slonik
    .connect(async conn => {
      const content = req.query.content
      const id = await conn.oneFirst(sql.MessageId`
        insert into messages(content)
        values (${content})
        returning id
      `)
      res.status(201).send({id})
    })
    .catch(handleError(res))
  )

  app.get('/api/messages', (req, res) => slonik
    .connect(async conn => {
      let {before} = req.query
      const messages = await conn.any(sql.Message`
        select * from messages
        where id < ${before || 9999999}
        order by created_at desc
        limit 10
      `)
      res.status(200).send(messages.map(m => ({
        id: m.id,
        text: m.content,
        secondsAgo: Math.floor((Date.now() - m.created_at.getTime()) / 1000),
      })))
    })
    .catch(handleError(res))
  )

  app.get('/', (_req, res) => res.sendFile(resolve(__dirname + '/../index.html')))
  
  return app
}

/* istanbul ignore if */
if (require.main === module) {
  const port = process.env.PORT
  getApp().listen(port, () => console.log(`server listening on http://localhost:${port}`))
}
