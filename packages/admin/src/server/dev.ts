import express from 'express'
import {apiMiddleware} from './middleware.js'

const app = express()

app.use((req, res, next) => {
  const {origin} = req.headers
  if (origin) {
    const originUrl = new URL(origin)
    const allowedHosts = new Set(['localhost'])
    if (allowedHosts.has(originUrl.hostname)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.statusCode = 204
    res.end()
    return
  }

  next()
})

app.use(apiMiddleware)

app.listen(7002, () => {
  // eslint-disable-next-line no-console
  console.log('server listening on port 7002')
})
