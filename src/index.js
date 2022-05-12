import express, {urlencoded} from 'express'
import logger from 'winston'

import c from './config'
import {invoiceHandler} from './invoice'
import {handleAction, handleMessage, boltReceiver, boltApp, handleHomeOpened} from './slack'
import {initStorage} from './storage'
import {routes as r} from './routes'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()

app.get(r.invoice, urlencoded({extended: true}), invoiceHandler)

app.use(r.events, boltReceiver.router)
app.use(r.actions, boltReceiver.router)

/**
  @type import('@slack/bolt/dist/App').ExtendedErrorHandler
*/
const errorHandler = ({error: {code, message, name, req, stack}, context, body}) => {
  logger.error(`code: ${code}, message: ${message}, name: ${name}, req: ${JSON.stringify(req)}, stack: ${stack}, context: ${JSON.stringify(context)}, body: ${JSON.stringify(body)}`)
}

boltApp.error(errorHandler)

boltApp.event('message', ({message, say}) => handleMessage(message, say))
boltApp.action(/.*/g, (event) => handleAction(event))
boltApp.event('app_home_opened', (event) => handleHomeOpened(event))

;(async function() {
  app.listen(c.port, () =>
    logger.log('info', `App started on localhost:${c.port}.`),
  )

  await Promise.all([
    Promise.all(Object.values(c.bots).map((bot) => initStorage(bot.storage, c.google))),
  ])

})().catch((e) => {
  logger.log('error', e)
  process.exit(1)
})
