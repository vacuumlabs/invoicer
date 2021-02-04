import c from './config'
import logger from 'winston'
import {init, apiCall, apiCallMultipart, showError} from './slackApi'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import renderInvoice from './invoice'
import pdf from 'html-pdf'
import {routes as r, store} from './routes'
import renderXML from './invoices2PohodaXML'
import {saveInvoice} from './storage'

const currencyFormat = Intl.NumberFormat('sk-SK', {minimumFractionDigits: 2, maximumFractionDigits: 2})

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken}`,
}})

let apiState
let pendingInvoice = {}

export async function listenSlack(bots, token, stream) {
  apiState = init(token, stream)

  const isCSVUpload = (e) => (
    e.type === 'message' &&
    e.files &&
    e.files.length === 1 &&
    e.files[0].filetype === 'csv'
  )

  for (;;) {
    const event = await stream.take()
    logger.log('verbose', `slack event ${event.type}`, event)

    const channelId = event.channel && (event.channel.id || event.channel)
    const bot = channelId && bots[channelId]

    if (!bot) {
      continue
    }

    const botPendingInvoice = pendingInvoice[channelId]

    if (isCSVUpload(event)) {
      logger.verbose('csv uploaded', event.files[0].url_private)
      handleCSVUpload(event, bot, botPendingInvoice)
      continue
    }

    if (event.type === 'action') {
      if (botPendingInvoice && botPendingInvoice.id === event.callback_id) {
        await handleInvoicesAction(event, bot, botPendingInvoice)
        pendingInvoice[channelId] = null
      } else {
        logger.log('warn', 'pending invoice error', botPendingInvoice, event.callback_id)
        await showError(apiState, channelId,
          'The operation has timed out. Please, re-upload your CSV file with invoices.',
          event.original_message.ts
        )
      }
    }
  }
}

async function cancelInvoices(ts, channel) {
  await showError(apiState, channel, 'Invoices canceled', ts)
}

async function handleInvoicesAction(event, bot, botPendingInvoice) {
  const {channel, ts, message: {attachments: [attachment]}} =
    botPendingInvoice.confirmation

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
    await sendInvoices(botPendingInvoice.invoices, botPendingInvoice.comment, bot)
      .catch((e) => showError(apiState, channel, 'Something went wrong.'))

    await apiCall(apiState, 'chat.update', {
      channel, ts, as_user: true,
      text: ':woman: Invoices sent successfully.',
      attachments: [],
    })

  } else {
    await cancelInvoices(ts, channel)
  }
}

async function getChannelForUserID(userID) {
  const channel = await apiCall(apiState, 'conversations.open', {users: userID})
  if (channel.ok) {
    return (channel.channel.id)
  } else {
    return null
  }
}

async function sendPdf(htmlInvoice, invoice, bot) {
  const stream = await new Promise((resolve, reject) => {
    pdf
      .create(htmlInvoice, {format: 'A4'})
      .toStream((err, stream) => {
        if (err) {
          logger.warn('PDF conversion failed')
          return reject(err)
        }

        return resolve(stream)
      })
  })

  const fileData = await saveInvoice(invoice, stream, bot.storage)

  return fileData
}

async function sendXML(invoices, title, name, bot) {
  const filename = `${name}.xml`

  await apiCallMultipart(apiState, 'files.upload', {
    title: `${title}.xml`,
    filename,
    channels: bot.channel,
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

async function sendInvoiceToUser(invoice, comment, bot) {
  const htmlInvoice = renderInvoice(invoice)
  const fileData = await sendPdf(htmlInvoice, invoice, bot)

  if (!bot.sendOnSlack) {
    return true
  }

  const channelId = await getChannelForUserID(invoice.slackId)

  if (channelId) {
    await apiCall(apiState, 'chat.postMessage', {
      channel: channelId,
      text: comment.replace('_link_', `<${fileData.url}|${fileData.name}>`),
    })

    return true
  } else {
    return false
  }
}

async function sendInvoices(invoices, comment, bot) {
  let failMessage = 'I was unable to deliver the invoice to users:\n'
  let ts = null
  let count = 0
  for (const i of invoices) {
    const success = await sendInvoiceToUser(i, comment, bot).catch((err) => {
      logger.warn('Failed to send invoice', err)
      return false
    })

    if (success) {
      count++
    } else {
      if (!ts) ts = (await showError(apiState, bot.channel, failMessage)).ts
      failMessage += `${i.user}\n`
      await showError(apiState, bot.channel, failMessage, ts)
    }
  }
  await apiCall(apiState, 'chat.postMessage', {
    channel: bot.channel,
    as_user: true,
    text: `Successfully delivered ${count} invoices.`,
  })
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

async function handleCSVUpload(event, bot, botPendingInvoice) {
  if (botPendingInvoice) {
    await cancelInvoices(
      botPendingInvoice.confirmation.ts,
      botPendingInvoice.confirmation.channel,
    )
  }

  const file = event.files[0]
  const csv = await request.get(file.url_private)
  const invoices = csv2invoices(csv) // TODO: Error handling invalid CSV

  await sendXML(invoices, file.title, file.name, bot)

  const confirmation = await apiCall(apiState, 'chat.postMessage', {
    channel: bot.channel,
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

  pendingInvoice[bot.channel] = {
    id: event.ts,
    invoices,
    confirmation,
    comment: event.text || 'Your monthly invoice from VacuumLabs: _link_',
  }
}
