import * as express from 'express'
import {slonik, sql} from './db'
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
        const id = await conn.oneFirst(sql<queries.Messages_id>`
          insert into messages(content)
          values (${content})
          returning id
        `)

        await conn.query(sql<queries.PgType>`select typname from pg_type limit 1`)

        // await conn.oneFirst(sql.NotAType`
        //   insert into messages(content)
        //   values (${content})
        //   returning id
        // `)
        res.status(201).send({id})
      })
      .catch(handleError(res)),
  )

  app.get('/api/messages', (req, res) =>
    slonik
      .connect(async conn => {
        let before = req.query.before as string
        const messages = await conn.any(sql<queries.Messages>`
          select * from messages
          where id < ${before || 9999999}
          order by created_at desc
          limit 10
        `)

        res.status(200).send(
          messages.map(m => ({
            id: m.id,
            text: m.content,
            secondsAgo: Math.floor((Date.now() - m.created_at.getTime()) / 1000),
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

module queries {
  /**
   * - query: `insert into messages(content) values ($1) returning id`
   */
  export interface Messages_id {
    /** postgres type: integer */
    id: number
  }

  /**
   * - query: `select typname from pg_type limit 1`
   */
  export interface PgType {
    /** postgres type: name */
    typname: string
  }

  /**
   * - query: `select * from messages where id < $1 order by created_at desc limit 10`
   */
  export interface Messages {
    /** postgres type: integer */
    id: number
    /** postgres type: character varying(20) */
    content: string
    /** postgres type: timestamp with time zone */
    created_at: Date
    /** postgres type: message_priority */
    priority: 'high' | 'low' | 'medium'
  }
}
