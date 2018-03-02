import c from './config'
import {createChannel} from 'yacol'
import logger from 'winston'
import {init, apiCall, apiCallMultipart, showError} from './slackApi'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import renderInvoice from './invoice'
import pdf from 'html-pdf'
import {routes as r, store} from './routes'
import renderXML from './invoices2PohodaXML'

const currencyFormat = Intl.NumberFormat('sk-SK', {minimumFractionDigits: 2, maximumFractionDigits: 2})

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken}`,
}})

const streams = {}
let apiState
let pendingInvoice = null

export async function listenSlack(token, stream) {
  apiState = init(token, stream)

  for (;;) {
    const event = await stream.take()
    logger.log('verbose', `slack event ${event.type}`, event)

    if (event.type === 'message' && event.channel === c.invoicingChannel) {
      streamForUser(event.user).put(event)
      continue
    }

    if (event.type === 'action') {
      if (pendingInvoice && pendingInvoice.id === event.callback_id) {
        await handleInvoicesAction(event)
        pendingInvoice = null
      } else {
        await showError(apiState, event.channel.id,
          'The operation has timed out. Please, re-upload your CSV file with invoices.',
          event.original_message.ts
        )
      }
    }
  }
}

async function cancelInvoices(ts) {
  await showError(apiState, c.invoicingChannel, 'Invoices canceled', ts)
}


async function handleInvoicesAction(event) {
  const {channel, ts, message: {attachments: [attachment]}} =
    pendingInvoice.confirmation

  async function updateMessage(attachmentUpdate) {
    await apiCall(apiState, 'chat.update', {channel, ts, as_user: true,
      attachments: [{...attachment, ...attachmentUpdate}],
    })
  }

  if (event.actions[0].name === 'send') {
    await updateMessage({
      pretext: ':woman: Sending invoices:',
      color: 'good',
      actions: [],
    })
    await sendInvoices(pendingInvoice.invoices)
      .catch((e) => showError(apiState, event.channel.id, 'Something went wrong.'))
    await updateMessage({
      pretext: ':woman: Sending invoices: finished',
      color: 'good',
      actions: [],
    })
  } else {
    await cancelInvoices(ts)
  }
}

async function getChannelForUserID(userID) {
  const channel = await apiCall(apiState, 'im.open', {user: userID})
  if (channel.ok) {
    return (channel.channel.id)
  } else {
    return null
  }
}

function sendPdf(htmlInvoice, fileName, channelId) {
  pdf
    .create(htmlInvoice, {format: 'A4'})
    .toBuffer((err, buffer) => {
      if (err) logger.warn('PDF conversion failed')
      const formData = {
        filename: fileName,
        channels: channelId,
        initial_comment: 'Your monthly invoice from VacuumLabs:',
        file: {
          value: buffer,
          options: {
            filename: fileName,
            contentType: 'application/pdf',
          },
        },
      }
      apiCallMultipart(apiState, 'files.upload', formData)
    })
}

async function sendXML(invoices, title, name) {
  const filename = `${name}.xml`

  await apiCallMultipart(apiState, 'files.upload', {
    title: `${title}.xml`,
    filename,
    channels: c.invoicingChannel,
    initial_comment: 'Pohoda XML import',
    file: {
      value: renderXML({invoices}),
      options: {
        filename,
        contentType: 'application/xml',
      },
    },
  })
}

async function sendInvoiceToUser(invoice) {
  const channelId = await getChannelForUserID(invoice.slackId)
  if (channelId) {
    const htmlInvoice = renderInvoice(invoice)
    sendPdf(htmlInvoice, `${invoice.user}-${invoice.invoiceNumber}.pdf`, channelId)
    return true
  } else {
    return false
  }
}

async function sendInvoices(invoices) {
  let failMessage = 'I was unable to deliver the invoice to users:\n'
  let ts = null
  let count = 0
  for (const i of invoices) {
    const success = await sendInvoiceToUser(i)
    if (success) {
      count++
    } else {
      if (!ts) ts = (await showError(apiState, c.invoicingChannel, failMessage)).ts
      failMessage += `${i.user}\n`
      await showError(apiState, c.invoicingChannel, failMessage, ts)
    }
  }
  await apiCall(apiState, 'chat.postMessage', {
    channel: c.invoicingChannel,
    as_user: true,
    text: `Successfully delivered ${count} invoices.`,
  })
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


  const [date, cost, user, partner] = [
    invoice.issueDate.padEnd(10),
    currencyFormat.format(invoice.fullCostSum).padStart(9),
    trimPad(invoice.user, 13),
    trimPad(invoice.incomingInvoice ? invoice.vendorName : invoice.clientName, 18),
  ].map((f) => `\`${f}\``)

  const direction = invoice.incomingInvoice ? '⟹' : '⟸'
  const id = store(invoice)
  const url = `${c.host}${r.invoice}?${querystring.stringify({id})}`
  return `${date} ${cost} ${user} ${partner} ${direction} <${url}|📩>`
}

async function listenUser(stream, user) {
  for (;;) {
    const event = await stream.take()

    if (event.subtype === 'file_share' && event.file.filetype === 'csv') {
      logger.verbose('file uploaded', event.file.url_private)

      if (pendingInvoice) await cancelInvoices(pendingInvoice.confirmation.ts)

      const csv = await request.get(event.file.url_private)
      const invoices = csv2invoices(csv) // TODO: Error handling invalid CSV

      await sendXML(invoices, event.file.title, event.file.name)

      const confirmation = await apiCall(apiState, 'chat.postMessage', {
        channel: c.invoicingChannel,
        as_user: true,
        text: 'You have uploaded a file, haven\'t you?',
        attachments: [
          {
            title: 'Invoices summary',
            text: invoices.map(formatInvoice).join('\n'),
          },
          {
            title: 'Should I send above invoices?',
            callback_id: `${event.ts}`,
            actions: [
              {
                name: 'send',
                text: `Send ${invoices.length} invoices`,
                type: 'button',
                value: 'send',
                style: 'primary',
                confirm: {
                  title: 'Do you really want to send these invoices?',
                  ok_text: 'Yes, send them all',
                  dismiss_text: 'No',
                },
              },
              {
                name: 'cancel',
                text: 'Cancel',
                type: 'button',
                value: 'cancel',
                style: 'danger',
              },
            ],
          },
        ],
      })

      pendingInvoice = {
        id: event.ts,
        invoices,
        confirmation,
      }
    }
  }
}
