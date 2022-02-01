import express from 'express'
import bodyParser from 'body-parser'
import logger from 'winston'

import c from './config'
import {invoiceHandler} from './invoice'
import {ACTION_ID_CANCEL, ACTION_ID_SEND_EN, ACTION_ID_SEND_SK, handleAction, handleMessage, initState, boltReceiver, boltApp} from './slack'
import {initStorage} from './storage'
import {routes as r} from './routes'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()

app.get(r.invoice, bodyParser.urlencoded(), invoiceHandler)

app.use(r.events, boltReceiver.router)
app.use(r.actions, boltReceiver.router)

/**
  @type import('@slack/bolt/dist/App').ExtendedErrorHandler
*/
const errorHandler = async ({error: {code, message, name, req, stack}, context, body}) => {
  logger.error(`code: ${code}, message: ${message}, name: ${name}, req: ${JSON.stringify(req)}, stack: ${stack}, context: ${JSON.stringify(context)}, body: ${JSON.stringify(body)}`)
}

boltApp.error(errorHandler)

boltApp.event('message', ({message, say}) => handleMessage(message, say))
boltApp.action(new RegExp(`${ACTION_ID_SEND_SK}|${ACTION_ID_SEND_EN}|${ACTION_ID_CANCEL}`, 'g'), (event) => handleAction(event))

;(async function() {
  app.listen(c.port, () =>
    logger.log('info', `App started on localhost:${c.port}.`)
  )

  await Promise.all([
    Promise.all(Object.values(c.bots).map((bot) => initStorage(bot.storage, c.google))),
  ])

})().catch((e) => {
  logger.log('error', e)
  process.exit(1)
})
