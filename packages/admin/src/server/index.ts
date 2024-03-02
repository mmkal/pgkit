import express from 'express'
import * as path from 'path'
import {fileURLToPath} from 'url'
import {apiMiddleware} from './middleware.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Creates a router, which can be used as a middleware to:
 * 1. Serve static files from the client directory - the frontend.
 * 2. Serve the API, which the frontend will talk to.
 *
 * If you need to add more functionality, such as auth, or CORS, create your own express application
 * and add the router before (or after) your middleware.
 */
export const getExpressRouter = (): express.RequestHandler => {
  const router = express.Router()
  router.use(clientMiddleware)
  router.use(apiMiddleware)
  return router
}

export {appRouter, type AppRouter} from './router.js'
export {apiMiddleware} from './middleware.js'
export const clientMiddleware: express.RequestHandler = express.static(path.join(__dirname, '../client'))
