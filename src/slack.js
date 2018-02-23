import c from './config'
import {createChannel} from 'yacol'
import logger from 'winston'
import {init, apiCall, showError} from './slackApi'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import {routes as r, store} from './routes'

const currencyFormat = Intl.NumberFormat('sk-SK', {minimumFractionDigits: 2, maximumFractionDigits: 2})

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken}`,
}})

const streams = {}
let apiState

export async function listenSlack(token, stream) {
  apiState = init(token, stream)

  for (;;) {
    const event = await stream.take()
    logger.log('verbose', `slack event ${event.type}`, event)

    if (event.type === 'message' && event.channel === c.invoicingChannel) {
      streamForUser(event.user).put(event)
      continue
    }

  }
}

function streamForUser(userId) {
  if (streams[userId] == null) {
    streams[userId] = createChannel()
    listenUser(streams[userId], userId)
  }
  return streams[userId]
}

function formatInvoice(invoice) {
  const trimPad = (str, l) =>
    (str.length > l ? `${str.substring(0, l - 1)}~` : str).padEnd(l)


  const [date, cost, user, client, vendor] = [
    invoice.issueDate.padEnd(10),
    currencyFormat.format(invoice.fullCostSum).padStart(9),
    trimPad(invoice.user, 13),
    trimPad(invoice.clientName, 18),
    trimPad(invoice.vendorName, 18),
  ].map((f) => `\`${f}\``)

  const id = store(invoice)
  const url = `${c.host}${r.invoice}?${querystring.stringify({id})}`
  return `${date} ${cost} ${user} ${client} ⇒ ${vendor} <${url}|📩>`
}


async function listenUser(stream, user) {
  for (;;) {
    const event = await stream.take()

    if (event.subtype === 'file_share') {
      logger.verbose('file uploaded', event.file.url_private)
      const csv = await request.get(event.file.url_private)
      try{
        const invoices = csv2invoices(csv)
      }
      catch(e){
        showError(apiState, c.invoicingChannel, e)
        continue
      }
      const id = store({invoices})
      const url = `${c.host}${r.pohodaXML}?${querystring.stringify({id})}`
      const xmlMessage = `PohodaXML: <${url}|📩>\n`
      await apiCall(apiState, 'chat.postMessage', {
        channel: c.invoicingChannel,
        as_user: true,
        text: 'You have uploaded a file, haven\'t you?',
        attachments: [{
          title: 'Invoices summary',
          text: xmlMessage + invoices.map(formatInvoice).join('\n'),
        }],
      })
    }
  }
}
