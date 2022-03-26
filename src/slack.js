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
import {ACTION_ID_SEND_EN, ACTION_ID_SEND_SK, getSectionBlock, sendInvoicesButton, cancelButton, getButton, ACTION_ID_VL_BOT, ACTION_ID_WINCENT_BOT, getActionsBlock, HOME_BLOCKS} from './slackBlocks'
import {BLOCK_ID_HOME} from './constants'

const currencyFormat = Intl.NumberFormat('sk-SK', {minimumFractionDigits: 2, maximumFractionDigits: 2})

const request = _request.defaults({headers: {
  Authorization: `Bearer ${c.slack.botToken.vacuumlabs}`,
}})

const pendingInvoice = {}

const isCSVUpload = (event) => (
  event.files &&
  event.files.length === 1 &&
  event.files[0].filetype === 'csv'
)

export const boltReceiver = new ExpressReceiver({signingSecret: c.slack.signingSecret, endpoints: '/'})
export const boltApp = new App({
  token: c.slack.botToken.vacuumlabs,
  receiver: boltReceiver,
  extendedErrorHandler: true,
})

/**
 * @param {import('@slack/bolt').KnownEventFromType<"message">} message
 * @param {import("@slack/bolt").SayFn} say
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
        const {channel, ts} = botPendingInvoice.confirmation
        logger.info('Cancelling the old invoice, will be overwritten.')
        await showError(channel, 'Invoices canceled', ts)
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
export const handleAction = async ({action, body, ack, respond}) => {
  try {
    logger.info('action event')
    logger.info(JSON.stringify(action))

    await ack()

    // safe type narrowing
    // we know the handled action is always a block button action, but typescript doesn't
    if (!('block_id' in action) || action.type !== 'button' || body.type !== 'block_actions') return

    // don't handle home block actions yet
    if (action.block_id === BLOCK_ID_HOME) return

    const channelId = body.channel && body.channel.id
    const bot = channelId && c.bots[channelId]

    if (!bot) {
      logger.warn(`this channel (${channelId}) is not configured to be handled by the bot`)
      return
    }

    const botPendingInvoice = pendingInvoice[channelId]

    if (botPendingInvoice && botPendingInvoice.id === action.block_id) {
      if ([ACTION_ID_VL_BOT, ACTION_ID_WINCENT_BOT].includes(action.action_id)) {
        botPendingInvoice.isWincent = action.action_id === ACTION_ID_WINCENT_BOT
        const {invoices} = botPendingInvoice

        const message = 'Should I upload the invoices above to Google Drive and send them to the users on Slack?'

        await respond({
          text: message,
          blocks: [
            getSectionBlock(`*${message}*`),
            getActionsBlock({
              block_id: `${botPendingInvoice.id}`,
              elements: [
                sendInvoicesButton(invoices.length, 'SK'),
                sendInvoicesButton(invoices.length, 'EN'),
                cancelButton(),
              ],
            }),
          ],
        })
        return
      }

      await handleInvoicesAction(action, bot, botPendingInvoice, respond)
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

/**
 * @type import('@slack/bolt').Middleware<import('@slack/bolt').SlackEventMiddlewareArgs<"app_home_opened">>
 */
export const handleHomeOpened = async ({event, client}) => {
  try {
    const userId = event.user

    logger.info('app_home_opened', 'user:', userId)

    await client.views.publish({
      user_id: userId,
      view: {
        type: 'home',
        blocks: HOME_BLOCKS,
      },
    })
  } catch (e) {
    logger.error(e, JSON.stringify(event))
  }
}

/**
 * @param {import('@slack/bolt').ButtonAction} action
 */
async function handleInvoicesAction(action, bot, botPendingInvoice, respond) {
  // when action is handled, that means the buttons were posted in the first place,
  // so otherwise undefined `confirmation` is guaranteed to be present
  const {confirmation: {channel, ts}} = botPendingInvoice

  if ([ACTION_ID_SEND_SK, ACTION_ID_SEND_EN].includes(action.action_id)) {
    await respond(':woman: Uploading and sending invoice... :spinner:')

    try {
      await sendInvoices(
        botPendingInvoice.invoices,
        botPendingInvoice.comment,
        action.value,
        bot,
        botPendingInvoice.isWincent,
        respond,
      )
    } catch (e) {
      logger.error(e)
      await showError(channel, 'Something went wrong.')
    }
  } else { // action_id === 'cancel'
    logger.info('Cancelling based on cancel action.')
    await showError(channel, 'Invoices canceled', ts)
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

async function sendInvoiceToUser(invoice, comment, language, bot, isWincent) {
  const htmlInvoice = renderInvoice(invoice, language)
  const fileData = await sendPdf(htmlInvoice, invoice, bot)

  await boltApp.client.chat.postMessage({
    token: isWincent ? c.slack.botToken.wincent : undefined,
    channel: invoice.slackId,
    text: comment.replace('_link_', `<${fileData.url}|${fileData.name}>`),
  })
}

async function sendInvoices(invoices, comment, language, bot, isWincent, respond) {
  let failMessage = 'I was unable to deliver the invoice to users:\n'
  let ts = null
  let count = 0
  for (const i of invoices) {
    try {
      await sendInvoiceToUser(i, comment, language, bot, isWincent)
      count++
    } catch (err)  {
      logger.warn('Failed to send invoice', err)
      if (!ts) ts = (await showError(bot.channel, failMessage)).ts
      failMessage += `${i.user}\n`
      await showError(bot.channel, failMessage, ts)
    }
  }
  await respond(`:white_check_mark: Successfully uploaded and delivered ${count} invoices.`)
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

/**
 * @param {import("@slack/bolt").KnownEventFromType<"message">} event
 * @param {{ sendOnSlack: boolean; channel: string; }} bot
 * @param {import("@slack/bolt").SayFn} say
 */
async function handleCSVUpload(event, bot, say) {
  const file = event.files[0]
  logger.verbose(`handling CSV upload of file: ${JSON.stringify(file)}`)

  const csv = await request.get(file.url_private)

  const invoices = csv2invoices(csv) // TODO: Error handling invalid CSV

  // message - XML
  await sendXML(invoices, file.title, file.name, bot)

  const formattedInvoices = invoices.map(formatInvoice).join('\n')

  // message - invoice list
  await say(`*Invoices summary*\n${formattedInvoices}`)

  // don't send the second message with actions at all
  if (!bot.sendOnSlack) return

  const message = 'Which bot should I use to send these invoices?'

  const confirmation = await say({
    text: message,
    blocks: [
      getSectionBlock(`*${message}*`),
      getActionsBlock({
        block_id: `${event.ts}`,
        elements: [
          getButton({
            action_id: ACTION_ID_VL_BOT,
            text: 'InvoiceBot',
          }),
          getButton({
            action_id: ACTION_ID_WINCENT_BOT,
            text: 'Wincent-InvoiceBot',
          }),
          cancelButton(),
        ],
      }),
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
  return await boltApp.client.chat[ts ? 'update' : 'postMessage']({
    channel,
    ts,
    text: `:exclamation: ${msg}`,
  })
}
