import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run, createChannel} from 'yacol'
import logger from 'winston'
import renderInvoice from './invoice'
import {listenSlack} from './slack'
import pdf from 'html-pdf'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

const slackEvents = createChannel()

const exampleQuery = {
  invoiceNumber: 'VAC170007',
  vendorName: 'vacuumlabs s.r.o.',
  vendorAddress: 'Radlinského 10, 81107 Bratislava',
  vendorID: '48207497',
  vendorTaxID: '2120112962',
  vendorVAT: 'SK2120112962',
  vendorVATPayer: '',
  vendorIBAN: 'SK8809000000000494005548',
  vendorBIC: 'GIBASKBX',
  clientName: 'Samuel Hapák IT',
  clientAddress: 'Brančská 7, 85105 Bratislava',
  clientID: '50509527',
  clientTaxID: '1080786630',
  clientVAT: 'CZ2120112962',
  issueDate: '07.11.2017',
  paymentDate: '15.11.2017',
  serviceName: 'Prenájom pracovného priestoru za júl 2017',
  preTaxCost: '41,67',
  VATLevel: '20%',
  VAT: '8,33',
  fullCost: '50,00',
  selfInvoicing: 'true',
}

// eslint-disable-next-line require-yield
function* actions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

function* invoice(req, res) {
  // eslint-disable-next-line require-await
  yield (async function() {
    const htmlInvoice = renderInvoice(exampleQuery)
    pdf
      .create(htmlInvoice, {format: 'A4'})
      .toBuffer((err, buffer) => {
        if (err) logger.warn('PDF conversion failed')
        res.set({
          'Content-Disposition': 'attachment; filename="invoice.pdf"',
        })
        res.status(200).send(buffer)
      })
  })()
}

const r = {
  actions: '/actions',
  invoice: '/invoice/',
}

register(app, 'post', r.actions, actions)
register(app, 'get', r.invoice, invoice)

// eslint-disable-next-line require-await
;(async function() {
  run(runApp)
  app.listen(c.port, () =>
    logger.log('info', `App started on localhost:${c.port}.`)
  )

  await listenSlack(c.slack.botToken, slackEvents)

})().catch((e) => {
  logger.log('error', e)
  process.exit(1)
})
