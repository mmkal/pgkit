import * as express from 'express'
import {sql} from 'slonik'
import {slonik} from './db'
import {resolve} from 'path'

export const getApp = () => {
  const app = express()

  const handleError = (res: express.Response) => (err: any) => {
    console.error(err)
    res.status(500).send(`${err}`)
  }

  app.post('/api/messages', (req, res) =>
    slonik
      .connect(async conn => {
        const content = req.query.content as string
        const id = await conn.oneFirst(sql<queries.Id>`
        insert into messages(content)
        values (${content})
        returning id
      `)
        res.status(201).send({id})
      })
      .catch(handleError(res)),
  )

  app.get('/api/messages', (req, res) =>
    slonik
      .connect(async conn => {
        let before = req.query.before as string
        const messages = await conn.any(sql<queries.Message>`
        select * from messages
        where id < ${before || 9999999}
        order by created_at desc
        limit 10
      `)
        res.status(200).send(
          messages.map(m => ({
            id: m.id,
            text: m.content,
            secondsAgo: Math.floor((Date.now() - (m.created_at as any).getTime()) / 1000),
          })),
        )
      })
      .catch(handleError(res)),
  )

  app.get('/', (_req, res) => res.sendFile(resolve(__dirname + '/../index.html')))

  return app
}

/* istanbul ignore if */
if (require.main === module) {
  const port = process.env.PORT
  getApp().listen(port, () => console.log(`server listening on http://localhost:${port}`))
}

export declare namespace queries {
  /** - query: `insert into messages(content) values ($1) returning id` */
  export interface Id {
    /** column: `public.messages.id`, not null: `true`, regtype: `integer` */
    id: number
  }

  /** - query: `select * from messages where id < $1 order by created_at desc limit 10` */
  export interface Message {
    /** column: `public.messages.id`, not null: `true`, regtype: `integer` */
    id: number

    /** column: `public.messages.content`, regtype: `character varying(20)` */
    content: string | null

    /** column: `public.messages.created_at`, not null: `true`, regtype: `timestamp with time zone` */
    created_at: number

    /** column: `public.messages.priority`, regtype: `message_priority` */
    priority: ('low' | 'medium' | 'high') | null
  }
}
