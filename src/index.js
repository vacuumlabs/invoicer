import c from './config'
import express from 'express'
import bodyParser from 'body-parser'
import {expressHelpers, run, createChannel} from 'yacol'
import logger from 'winston'
import renderInvoice from './invoice'
import renderXML from './invoices2PohodaXML'
import {listenSlack} from './slack'
import pdf from 'html-pdf'
import {routes as r, shortNames} from './routes'

logger.cli()
logger.level = c.logLevel
logger.setLevels(logger.config.npm.levels)

const app = express()
app.use(bodyParser.urlencoded())

const {register, runApp} = expressHelpers

const slackEvents = createChannel()

const exampleQuery = {
  invoicePrefix: 'VAC17',
  invoiceNumber: '0007',
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
  issueDate: Date.parse('2017-11-07'),
  paymentDate: Date.parse('2017-11-15'),
  isReceived: '',
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
  selfInvoicing: 'true',
}

function query2invoice(query) {
  const invoice = query.id ? shortNames[query.id] : JSON.parse(query.invoice)
  invoice.issueDate = Date.parse(invoice.issueDate)
  invoice.paymentDate = Date.parse(invoice.paymentDate)
  return invoice
}

// eslint-disable-next-line require-yield
function* actions(req, res) {
  slackEvents.put({...JSON.parse(req.body.payload), type: 'action'})
  res.status(200).send()
}

function* invoice(req, res) {
  // eslint-disable-next-line require-await
  yield (async function() {
    const htmlInvoice = renderInvoice(query2invoice(req.query)/*exampleQuery*/)
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

function* pohodaXML(req, res) {
  // eslint-disable-next-line require-await
  yield (async function() {
    const XML = renderXML({invoices:[exampleQuery]})//shortNames[req.query.id])
    res.set({
      'Content-Disposition': 'attachment; filename="pohodaImport.xml"',
    })
    res.status(200).send(XML)
  })()
}


register(app, 'post', r.actions, actions)
register(app, 'get', r.invoice, invoice)
register(app, 'get', r.pohodaXML, pohodaXML)

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
