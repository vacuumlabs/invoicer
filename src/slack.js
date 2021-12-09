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
const pendingInvoice = {}

const isCSVUpload = (event) => (
  event.files &&
  event.files.length === 1 &&
  event.files[0].filetype === 'csv'
)

export const handleMessage = async (event) => {
  logger.info('message event')
  logger.verbose(JSON.stringify(event))

  const channelId = event.channel && (event.channel.id || event.channel)
  const bot = channelId && c.bots[channelId]

  if (!bot) {
    logger.warn(`this channel (${channelId}) is not configured to be handled by the bot`)
    return
  }

  if (isCSVUpload(event)) {
    const botPendingInvoice = pendingInvoice[channelId]
    // cancel old invoice, it will be overwritten by a new one
    if (botPendingInvoice) {
      await cancelInvoices(
        botPendingInvoice.confirmation.ts,
        botPendingInvoice.confirmation.channel,
      )
    }
    await handleCSVUpload(event, bot)
  }
}

export async function listenSlack(bots, token, stream) {
  apiState = init(token, stream)

  for (;;) {
    const event = await stream.take()
    logger.log('verbose', `slack event ${event.type}`, JSON.stringify(event))

    const channelId = event.channel && (event.channel.id || event.channel)
    const bot = channelId && bots[channelId]

    if (!bot) {
      continue
    }

    const botPendingInvoice = pendingInvoice[channelId]

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

  async function updateMessage(newAttachments, text) {
    await apiCall(apiState, 'chat.update', {
      channel, ts, as_user: true,
      attachments: newAttachments,
      ...{text},
    })
  }

  if (event.actions[0].name === 'send') {
    await updateMessage([{
      ...attachment,
      pretext: ':woman: Sending invoices:',
      color: 'good',
      actions: [],
    }])

    await sendInvoices(botPendingInvoice.invoices, botPendingInvoice.comment, event.actions[0].value, bot)
      .catch((e) => showError(apiState, channel, 'Something went wrong.'))

    await updateMessage([], ':woman: Invoices sent successfully.')

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

async function sendInvoiceToUser(invoice, comment, language, bot) {
  const htmlInvoice = renderInvoice(invoice, language)
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

async function sendInvoices(invoices, comment, language, bot) {
  let failMessage = 'I was unable to deliver the invoice to users:\n'
  let ts = null
  let count = 0
  for (const i of invoices) {
    const success = await sendInvoiceToUser(i, comment, language, bot).catch((err) => {
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
  return `${date} ${cost} ${user} ${partner} ${direction} <${`${url}&lang=SK`}|📩 SK> <${`${url}&lang=EN`}|📩 EN>`
}

async function handleCSVUpload(event, bot) {
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
            value: 'SK',
            style: 'primary',
            confirm: {
              title: 'Do you really want to send these Slovak invoices?',
              ok_text: 'Yes, send them all',
              dismiss_text: 'No',
            },
          },
          {
            name: 'send',
            text: `Send ${invoices.length} invoices (EN)`,
            type: 'button',
            value: 'EN',
            confirm: {
              title: 'Do you really want to send these English invoices?',
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
    comment: `${event.text || 'Your monthly invoice from VacuumLabs:'}\n_link_`,
  }
}
