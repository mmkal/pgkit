#!/usr/bin/env node
import {getExpressRouter} from './index.js'
import express from 'express'

const port = process.env.PGKIT_ADMIN_PORT || 7002
const app = express()
app.use(getExpressRouter())
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on http://localhost:${port}`)
})
