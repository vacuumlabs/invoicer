import c from './config'
import logger from 'winston'
import _request from 'request-promise'
import {csv2invoices} from './csv2invoices'
import querystring from 'querystring'
import renderInvoice from './invoice'
import pdf from 'html-pdf'
import {routes as r, store} from './routes'
import renderXML from './invoices2PohodaXML'
import {saveInvoice} from './storage'
import {App, ExpressReceiver} from '@slack/bolt'
import {ACTION_ID_SEND_EN, ACTION_ID_SEND_SK, sectionBlock, sendInvoicesButton, cancelButton} from './slackBlocks'

const currencyFormat = Intl.NumberFormat('sk-SK', {minimumFractionDigits: 2, maximumFractionDigits: 2})

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken}`,
}})

const pendingInvoice = {}

const isCSVUpload = (event) => (
  event.files &&
  event.files.length === 1 &&
  event.files[0].filetype === 'csv'
)

export const boltReceiver = new ExpressReceiver({signingSecret: c.slack.signingSecret, endpoints: '/'})
export const boltApp = new App({
  token: c.slack.botToken,
  receiver: boltReceiver,
  extendedErrorHandler: true,
})

/**
 * @param {import('@slack/bolt').KnownEventFromType<"message">} message
 */
export const handleMessage = async (message, say) => {
  try {
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
      await handleCSVUpload(message, bot, say)
    }
  } catch (e) {
    logger.error(`error in handleMessage: ${e}`)
    await showError(message.channel, `Something went wrong. Error info: \`${e}\``)
  }
}

/**
 * @type import('@slack/bolt').Middleware<import('@slack/bolt').SlackActionMiddlewareArgs
 * <import('@slack/bolt').SlackAction>>
 */
export const handleAction = async ({action, body, ack}) => {
  try {
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
      await showError(channelId,
        'The operation has timed out. Please, re-upload your CSV file with invoices.',
        body.message.ts,
      )
    }
  } catch (e) {
    logger.error(`error in handleAction: ${e}`)
  }
}

async function cancelInvoices(ts, channel) {
  await showError(channel, 'Invoices canceled', ts)
}

/**
 * @param {import('@slack/bolt').ButtonAction} action
 */
async function handleInvoicesAction(action, bot, botPendingInvoice) {
  const {confirmation: {channel, ts}} = botPendingInvoice

  if ([ACTION_ID_SEND_SK, ACTION_ID_SEND_EN].includes(action.action_id)) {
    await boltApp.client.chat.update({
      channel, ts, as_user: true,
      blocks: [
        sectionBlock('plain_text', `:woman: ${bot.sendOnSlack ? 'sending' : 'uploading'} invoice...`),
      ],
    })

    await sendInvoices(
      botPendingInvoice.invoices,
      botPendingInvoice.comment,
      action.value, bot,
    ).catch((e) => showError(channel, 'Something went wrong.'))

    await boltApp.client.chat.update({
      channel, ts, as_user: true,
      blocks: [
        sectionBlock('plain_text', `:woman: Invoices ${bot.sendOnSlack ? 'sent' : 'uploaded'} successfully.`),
      ],
    })
  } else { // action_id === 'cancel'
    await cancelInvoices(ts, channel)
  }
}

async function getChannelForUserID(userID) {
  const channel = await boltApp.client.conversations.open({users: userID})
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

  await boltApp.client.files.upload({
    title: `${title}.xml`,
    filename,
    channels: bot.channel,
    initial_comment: 'Pohoda XML import',
    content: renderXML({invoices}),
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
    await boltApp.client.chat.postMessage({
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
      if (!ts) ts = (await showError(bot.channel, failMessage)).ts
      failMessage += `${i.user}\n`
      await showError(bot.channel, failMessage, ts)
    }
  }
  await boltApp.client.chat.postMessage({
    channel: bot.channel,
    as_user: true,
    text: `Successfully delivered ${count} invoices.`,
  })
}

const formatInvoice = (invoice) => {
  const trimPad = (str, l) => {
    // if the string is empty, pad with '-' - space-only strings in backticks
    // can't be formatted by Slack properly
    const fillChar = str ? ' ' : '-'
    return (str.length > l ? `${str.substring(0, l - 1)}~` : str).padEnd(l, fillChar)
  }

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

async function handleCSVUpload(event, bot, say) {
  const file = event.files[0]
  logger.verbose(`handling CSV upload of file: ${JSON.stringify(file)}`)

  const csv = await request.get(file.url_private)

  const invoices = csv2invoices(csv) // TODO: Error handling invalid CSV

  // message - XML
  await sendXML(invoices, file.title, file.name, bot)

  const formattedInvoices = invoices.map(formatInvoice).join('\n')

  // message - invoice list
  await say({
    channel: bot.channel,
    as_user: true,
    text: `*Invoices summary*\n${formattedInvoices}`,
  })

  const message = bot.sendOnSlack
  ? 'Should I send the invoices above?'
  : 'Should I upload the invoices above to Google Drive?'

  // message - actions
  const confirmation = await say({
    channel: bot.channel,
    as_user: true,
    text: message,
    blocks: [
      sectionBlock('mrkdwn', `*${message}*`),
      {
        type: 'actions',
        block_id: `${event.ts}`,
        elements: [
          sendInvoicesButton(invoices.length, 'SK', bot.sendOnSlack),
          sendInvoicesButton(invoices.length, 'EN', bot.sendOnSlack),
          cancelButton(),
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

async function showError(channel, msg, ts = null) {
  await boltApp.client.chat[ts ? 'update' : 'postMessage']({
    channel,
    ts,
    as_user: true,
    blocks: [
      sectionBlock('mrkdwn', `:exclamation: ${msg}`),
    ],
  })
}
