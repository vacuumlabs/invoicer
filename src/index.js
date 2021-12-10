import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run} from 'yacol'
import logger from 'winston'
import pdf from 'html-pdf'
import {App, ExpressReceiver} from '@slack/bolt'

import c from './config'
import renderInvoice from './invoice'
import {ACTION_ID_CANCEL, ACTION_ID_SEND_EN, ACTION_ID_SEND_SK, handleAction, handleMessage, initState} from './slack'
import {initStorage} from './storage'
import {routes as r, shortNames} from './routes'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()

const {register, runApp} = expressHelpers

/*const exampleQuery = {
  invoicePrefix: 'VAC17',
  invoiceNumber: '0007',
  vendorName: 'vacuumlabs s.r.o.',
  vendorAddress: 'Radlinského 10, 81107 Bratislava',
  vendorID: '48207497',
  vendorTaxID: '2120112962',
  vendorVAT: 'SK2120112962',
  vendorVATPayer: false,
  vendorIBAN: 'SK8809000000000494005548',
  vendorBIC: 'GIBASKBX',
  clientName: 'Samuel Hapák IT',
  clientAddress: 'Brančská 7, 85105 Bratislava',
  clientID: '50509527',
  clientTaxID: '1080786630',
  clientVAT: 'CZ2120112962',
  issueDate: Date.parse('2017-11-07'),
  paymentDate: Date.parse('2017-11-15'),
  services: [{
    name: 'Prenájom pracovného priestoru za júl 2017',
    preTaxCost: 41.67,
    VATLevel: 0.2,
    VAT: 8.33,
    fullCost: 50.00,
  },
  {
    name: 'Odmena za vytvorenie diela',
    preTaxCost: 100.34,
    VATLevel: 0.16,
    VAT: 8.99,
    fullCost: 3810.10,
  }],
  preTaxCostSum: 141.81,
  VATSum: 19.00,
  fullCostSum: 151.23,
  incomingInvoice: true,
}*/

function query2invoice(query) {
  const invoice = query.id ? {...shortNames[query.id]} : JSON.parse(query.invoice)
  invoice.issueDate = Date.parse(invoice.issueDate)
  invoice.paymentDate = Date.parse(invoice.paymentDate)
  return invoice
}

function* invoice(req, res) {
  // eslint-disable-next-line require-await
  yield (async function() {
    const invoiceData = query2invoice(req.query)
    const htmlInvoice = renderInvoice(invoiceData, req.query.lang)
    pdf
      .create(htmlInvoice, {format: 'A4'})
      .toBuffer((err, buffer) => {
        if (err) logger.warn('PDF conversion failed')
        const fileName = `${invoiceData.user || invoiceData.clientName}-${invoiceData.invoicePrefix}${invoiceData.invoiceNumber}`
        res.set({
          'Content-Disposition': `attachment; filename="${fileName}.pdf"`,
        })
        res.status(200).send(buffer)
      })
  })()
}

register(app, 'get', r.invoice, express.Router().use([bodyParser.urlencoded(), invoice]))

// inspired by: https://github.com/slackapi/bolt-js/issues/212
// done the same way as in AskMeBot
const boltReceiver = new ExpressReceiver({signingSecret: c.slack.signingSecret, endpoints: '/'})

app.use(r.events, boltReceiver.router)
app.use(r.actions, boltReceiver.router)

const boltApp = new App({token: c.slack.botToken, receiver: boltReceiver, extendedErrorHandler: true})

/**
  @type import('@slack/bolt/dist/App').ExtendedErrorHandler
*/
const errorHandler = async ({error: {code, message, name, req, stack}, context, body}) => {
  logger.error(`code: ${code}, message: ${message}, name: ${name}, req: ${JSON.stringify(req)}, stack: ${stack}, context: ${JSON.stringify(context)}, body: ${JSON.stringify(body)}`)
}

boltApp.error(errorHandler)

boltApp.event('message', ({message}) => handleMessage(message))

boltApp.action(new RegExp(`${ACTION_ID_SEND_SK}|${ACTION_ID_SEND_EN}|${ACTION_ID_CANCEL}`, 'g'), (event) => handleAction(event))

;(async function() {
  initState(c.slack.botToken)

  run(runApp)

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
