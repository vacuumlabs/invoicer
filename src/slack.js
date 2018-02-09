import c from './config'
import {createChannel} from 'yacol'
import logger from 'winston'
import {init, apiCall} from './slackApi'

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

async function listenUser(stream, user) {
  for (;;) {
    const event = await stream.take()

    if (event.subtype === 'file_share') {
      logger.verbose('file uploaded', event.file.url_private)
      await apiCall(apiState, 'chat.postMessage', {
        channel: c.invoicingChannel,
        as_user: true,
        text: 'You have uploaded a file, haven\'t you?',
      })
    }
  }
}
