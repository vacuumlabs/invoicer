import c from './config'
import logger from 'winston'
import {apiCall, apiCallMultipart, showError} from './slackApi'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import renderInvoice from './invoice'
import pdf from 'html-pdf'
import {routes as r, store} from './routes'
import renderXML from './invoices2PohodaXML'
import {saveInvoice} from './storage'

export const ACTION_ID_SEND_SK = 'send_sk'
export const ACTION_ID_SEND_EN = 'send_en'
export const ACTION_ID_CANCEL = 'cancel'

const currencyFormat = Intl.NumberFormat('sk-SK', {minimumFractionDigits: 2, maximumFractionDigits: 2})

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken}`,
}})

let apiState
const pendingInvoice = {}

export const initState = (token) => {
  apiState = {
    token,
  }
}

const isCSVUpload = (event) => (
  event.files &&
  event.files.length === 1 &&
  event.files[0].filetype === 'csv'
)

/**
 * @param {import('@slack/bolt').KnownEventFromType<"message">} message
 */
export const handleMessage = async (message) => {
  logger.info('message event')
  logger.verbose(JSON.stringify(message))

  const channelId = message.channel
  const bot = channelId && c.bots[channelId]

  if (!bot) {
    logger.warn(`this channel (${channelId}) is not configured to be handled by the bot`)
    return
  }

  if (isCSVUpload(message)) {
    const botPendingInvoice = pendingInvoice[channelId]
    // cancel old invoice, it will be overwritten by a new one
    if (botPendingInvoice) {
      await cancelInvoices(
        botPendingInvoice.confirmation.ts,
        botPendingInvoice.confirmation.channel,
      )
    }
    await handleCSVUpload(message, bot)
  }
}

/**
 * @type import('@slack/bolt').Middleware<import('@slack/bolt').SlackActionMiddlewareArgs<import('@slack/bolt').SlackAction>>
 */
export const handleAction = async ({action, body, ack}) => {
  logger.info('action event')
  logger.info(JSON.stringify(action))

  await ack()

  // safe type narrowing
  // we know the handled action is always a block button action, but typescript doesn't
  if (!('block_id' in action) || action.type !== 'button' || body.type !== 'block_actions') return

  const channelId = body.channel && body.channel.id
  const bot = channelId && c.bots[channelId]

  if (!bot) {
    logger.warn(`this channel (${channelId}) is not configured to be handled by the bot`)
    return
  }

  const botPendingInvoice = pendingInvoice[channelId]

  if (botPendingInvoice && botPendingInvoice.id === action.block_id) {
    await handleInvoicesAction(action, bot, botPendingInvoice)
    pendingInvoice[channelId] = null
  } else {
    logger.warn('pending invoice error', botPendingInvoice, action.block_id)
    await showError(apiState, channelId,
      'The operation has timed out. Please, re-upload your CSV file with invoices.',
      body.message.ts
    )
  }
}

async function cancelInvoices(ts, channel) {
  await showError(apiState, channel, 'Invoices canceled', ts)
}

const getInvoicesSummaryBlocks = (invoices) => [
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: '*Invoices summary*',
    },
  },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: invoices.map(formatInvoice).join('\n'),
    },
  },
]

/**
 * @param {import('@slack/bolt').ButtonAction} action
 */
async function handleInvoicesAction(action, bot, botPendingInvoice) {
  const {channel, ts, invoices} = botPendingInvoice.confirmation

  if (action.action_id === 'send') {
    await apiCall(apiState, 'chat.update', {
      channel, ts, as_user: true,
      blocks: [
        ...getInvoicesSummaryBlocks(invoices),
        {
          type: 'section',
          text: {
            type: 'plain_text',
            text: ':woman: Sending invoice...:',
          },
        },
      ],
    })

    await sendInvoices(botPendingInvoice.invoices, botPendingInvoice.comment, action.value, bot)
      .catch((e) => showError(apiState, channel, 'Something went wrong.'))

    await apiCall(apiState, 'chat.update', {
      channel, ts, as_user: true,
      blocks: [
        ...getInvoicesSummaryBlocks(invoices),
        {
          type: 'section',
          text: {
            type: 'plain_text',
            text: ':woman: Invoices sent successfully.',
          },
        },
      ],
    })
  } else { // action_id === 'cancel'
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
    text: 'Invoices summary',
    blocks: [
      ...getInvoicesSummaryBlocks(invoices),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Should I send above invoices?*',
        },
      },
      {
        type: 'actions',
        block_id: `${event.ts}`,
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `Send ${invoices.length} invoices`,
            },
            action_id: ACTION_ID_SEND_SK,
            value: 'SK',
            style: 'primary',
            confirm: {
              title: {
                type: 'plain_text',
                text: 'Are you sure?',
              },
              text: {
                type: 'plain_text',
                text: 'Do you really want to send these Slovak invoices?',
              },
              confirm: {
                type: 'plain_text',
                text: 'Yes, send them all',
              },
              deny: {
                type: 'plain_text',
                text: 'No',
              },
            },
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: `Send ${invoices.length} invoices (EN)`,
            },
            action_id: ACTION_ID_SEND_EN,
            value: 'EN',
            confirm: {
              title: {
                type: 'plain_text',
                text: 'Are you sure?',
              },
              text: {
                type: 'plain_text',
                text: 'Do you really want to send these English invoices?',
              },
              confirm: {
                type: 'plain_text',
                text: 'Yes, send them all',
              },
              deny: {
                type: 'plain_text',
                text: 'No',
              },
            },
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Cancel',
            },
            action_id: ACTION_ID_CANCEL,
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
