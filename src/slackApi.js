import _request from 'request-promise'
import logger from 'winston'

const request = _request.defaults({})
const API = 'https://slack.com/api/'

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
    // first difference from apiCall - the `k !== 'file'` check
    if (typeof data[k] === 'object' && k !== 'file') data[k] = JSON.stringify(data[k])
  }

  logger.log('verbose', `call slack.api.${name}`, data)
  // second difference from apiCall - `formData:` vs. `form:`
  const response = JSON.parse(await request.post(`${API}${name}`, {formData: {...data, token: state.token}}))
  logger.log('verbose', `response slack.api.${name}`, {args: data, response})

  return response
}

export async function showError(state, channel, msg, ts = null) {
  return await apiCall(state, ts ? 'chat.update' : 'chat.postMessage', {
    channel, ts, as_user: true,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:exclamation: ${msg}`,
        },
      },
    ],
  })
}
