import c from './config'
import {createChannel} from 'yacol'
import logger from 'winston'
import {init, apiCall, apiCallMultipart} from './slackApi'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import renderInvoice from './invoice'
import pdf from 'html-pdf'
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

async function getChannelForUserID(userID) {
  const channel = await apiCall(apiState, 'im.open', {user: userID})
  if (channel.ok) {
    return (channel.channel.id)
  } else {
    return undefined
  }
}

async function sendPdf(htmlInvoice, channelId) {
  pdf
    .create(htmlInvoice, {format: 'A4'})
    .toBuffer(async (err, buffer) => {
      if (err) logger.warn('PDF conversion failed')
      const formData = {
        filename: 'invoice.pdf',
        channels: 'D97MH5YCR',
        initial_comment: 'I have received your invoice!',
        file: {
          value: buffer,
          options: {
            filename: 'invoice.pdf',
            contentType: 'application/pdf',
          },
        },
      }
      await apiCallMultipart(apiState, 'files.upload', formData)
    })
}

async function sendInvoiceToUser(invoice) {
  const channelId = await getChannelForUserID(invoice.slackId)
  if (channelId) {
    const htmlInvoice = renderInvoice(invoice)
    await sendPdf(htmlInvoice, channelId)
    return true
  } else {
    return false
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
      const invoices = csv2invoices(csv) // TODO: Error handling invalid CSV
      await apiCall(apiState, 'chat.postMessage', {
        channel: c.invoicingChannel,
        as_user: true,
        text: 'You have uploaded a file, haven\'t you?',
        attachments: [{
          title: 'Invoices summary',
          text: invoices.map(formatInvoice).join('\n'),
        }],
      })
      for (const i of invoices) {
        const success = await sendInvoiceToUser(i)
        if (i.slackId && !success) {
          await apiCall(apiState, 'chat.postMessage', {
            channel: c.invoicingChannel,
            as_user: true,
            text: `I didn't find user ${i.slackId}.`,
          })
        }
      }
    }
  }
}
