import {google} from 'googleapis'
import logger from 'winston'

export function init(googleConfig) {
    logger.log('verbose', 'gdrive - init')

    const key = Buffer.from(googleConfig.key, 'base64').toString()
    const auth = new google.auth.JWT(googleConfig.email, null, key, ['https://www.googleapis.com/auth/drive'])

    google.options({
      auth,
    })
  }
