import c from './config'
import {createChannel} from 'yacol'
import logger from 'winston'
import {init, apiCall} from './slackApi'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import r from './routes'

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken}`
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
    (str.length > l ? str.substring(0, l - 3) + '...' : str).padEnd(l)

  const [date, cost, user, client, vendor] = [
    invoice.issueDate.padEnd(10),
    invoice.fullCost.padStart(8),
    trimPad(invoice.user, 15),
    trimPad(invoice.clientName, 18),
    trimPad(invoice.vendorName, 18),
  ].map((f) => `\`${f}\``)

  const url = `${c.host}${r.invoice}?${querystring.stringify(invoice)}`
  return `${date} ${cost} ${user} ${client} ⇒ ${vendor} <${url}|📩>`
}

async function listenUser(stream, user) {
  for (;;) {
    const event = await stream.take()

    if (event.subtype === 'file_share') {
      logger.verbose('file uploaded', event.file.url_private)
      const csv = await request.get(event.file.url_private)
      const invoices = csv2invoices(csv)
      await apiCall(apiState, 'chat.postMessage', {
        channel: c.invoicingChannel,
        as_user: true,
        text: 'You have uploaded a file, haven\'t you?',
        attachments: [{
          title: 'Invoices summary',
          text: invoices.map(formatInvoice).join('\n'),
        }]
      })
    }
  }
}
