import * as express from 'express'
import { slonik, sql } from './db';
import { resolve } from 'path';

export const start = () => {
  const port = process.env.PORT
  const app = express()

  app.post('/messages', (req, res) => slonik
    .connect(async conn => {
      const content = req.query.content
      const id = await conn.oneFirst(sql.MessageId`
        insert into messages(content)
        values (${content})
        returning id
      `)
      res.status(201).send({id})
    })
    .catch(err => res.status(500).send(err))
  )

  app.get('/messages', (req, res) => slonik
    .connect(async conn => {
      const messages = await conn.any(sql.Message`
        select * from messages
        order by created_at desc
        limit 10
      `)
      res.status(200).send(messages)
    })
  )

  app.get('/', (_req, res) => res.sendFile(resolve(__dirname + '/../index.html')))

  app.listen(port, () => console.log(`server listening on http://localhost:${port}`))
}

if (require.main === module) {
  start()
}
