import _request from 'request-promise'
import logger from 'winston'
import WS from 'ws'

const request = _request.defaults({})
const API = 'https://slack.com/api/'

export function init(token, stream) {
  const state = {
    token,
  }
  maintainConnection(state, stream)
  return state
}

async function maintainConnection(state, stream) {
  for (;;) {
    const connection = await connect(state, stream)
    while (await isAlive(connection)) {/* empty */}
    connection.terminate()
    logger.log('info', 'Connection dropped, reconnecting.')
  }
}

async function isAlive(connection) {
  let alive = false
  connection.ping('')
  connection.once('pong', () => (alive = true))
  await new Promise((resolve) => setTimeout(resolve, 10000))
  return alive
}

async function connect(state, stream) {
  const response = await apiCall(state, 'rtm.connect')

  state.team = response.team
  state.bot = response.self

  const connection = new WS(response.url)
  connection.on('message', (data) => stream.put(JSON.parse(data)))
  await new Promise((resolve) => connection.once('open', resolve))

  logger.log('info', 'WS connection to Slack established', {...state, token: '[SECRET]'})

  return connection
}

export function isMessage(event) {
  return event.type === 'message' && event.subtype == null
}

export function amIMentioned(state, event) {
  if (event.user === state.bot.id) return false
  if (event.channel[0] === 'D') return true
  if (event.text.match(`<@${state.bot.id}>`)) return true
  return false
}

export async function apiCall(state, name, data = {}) {
  for (const k in data) {
    if (typeof data[k] === 'object') data[k] = JSON.stringify(data[k])
  }

  logger.log('verbose', `call slack.api.${name}`, data)
  const response = JSON.parse(await request.post(`${API}${name}`, {form: {...data, token: state.token}}))
  logger.log('verbose', `response slack.api.${name}`, {args: data, response})

  return response
}

export async function apiCallMultipart(state, name, data = {}) {
  for (const k in data) {
    if (typeof data[k] === 'object' && k !== 'file') data[k] = JSON.stringify(data[k])
  }

  logger.log('verbose', `call slack.api.${name}`, data)
  const response = JSON.parse(await request.post(`${API}${name}`, {formData: {...data, token: state.token}}))
  logger.log('verbose', `response slack.api.${name}`, {args: data, response})

  return response
}

export async function showError(state, channel, msg, ts = null) {
  return await apiCall(state, ts ? 'chat.update' : 'chat.postMessage', {
    channel, ts, as_user: true, text: `:exclamation: ${msg}`, attachments: [],
  })
}
