import {google} from 'googleapis'
import _ from 'lodash'
import logger from 'winston'

const sheets = google.sheets({version: 'v4'})

export async function getForeignCurrencyRates() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    logger.verbose('gdrive - read spreadsheet')

    // source google sheet for up-to-date currency rates
    // https://docs.google.com/spreadsheets/d/1HfaU9jXZtCfdotEEfDO0d4EpDLyhmqdepaWgn_a6Lsw/edit#gid=1807750274
    const fileId = '1HfaU9jXZtCfdotEEfDO0d4EpDLyhmqdepaWgn_a6Lsw'
    const today = new Date()
    const prevMonth = (today.getMonth() + 12 - 1) % 12
    const prevMonthYear = prevMonth === 11 ? today.getFullYear() - 1 : today.getFullYear()
    const sheetName =  `${monthNames[prevMonth]} ${prevMonthYear}` // e.g. 'Nov 2022'

    const {data:{values:rates}} = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${sheetName}!A2:B50`,
    })

    // from:to ~ 1:value
    const rate = {
      EUR_EUR: 1,
      CZK_CZK: 1,
      HUF_HUF: 1,
      EUR_CZK: _.round(rates.find(([currency, rate]) => currency === 'CZK')[1], 4),
      EUR_HUF: _.round(rates.find(([currency, rate]) => currency === 'HUF')[1], 6),
    }
    rate.CZK_EUR = _.round(1 / rate.EUR_CZK, 4)
    rate.CZK_HUF = _.round(rate.EUR_HUF / rate.EUR_CZK, 6)
    rate.HUF_CZK = _.round(rate.EUR_CZK / rate.EUR_HUF, 4)
    rate.HUF_EUR = _.round(1 / rate.EUR_HUF, 4)

    logger.verbose('Using following rates today:')
    logger.verbose({rate})

    return rate
  }

