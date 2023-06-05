import transenv from 'transenv'
export default transenv()(({str, bool, num}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  const bots = str('bots_config').split(';').reduce((acc, botData) => {
    const fields = botData.split(',')

    if (fields.length !== 6 && fields.length !== 7) {
      throw new Error(`Invalid bot config - ${botData}`)
    }

    const [
      channel,
      storageRootFolder,
      storageUserFolder,
      adminEmails,
      sendOnSlack,
      groupByYear,
      // optional
      companyDrive = 'vl',
    ] = fields

    if (companyDrive !== 'vl') {
      throw new Error(`Invalid company drive - ${companyDrive}`)
    }

    acc[channel] = {
      channel,
      companyDrive,
      storage: {
        adminEmails,
        rootFolder: storageRootFolder,
        userFolder: storageUserFolder,
        groupByYear: groupByYear && groupByYear === '1',
      },
      sendOnSlack: sendOnSlack && sendOnSlack === '1',
    }

    return acc
  }, {})

  return {
    env,
    logLevel: str('log_level', isDevelopment ? 'debug' : 'error'),
    port: str('PORT'),
    host: str('host'),
    slack: {
      botToken: {
        vacuumlabs: str('slack_bot_token'),
        wincent: str('slack_bot_token_wincent'),
      },
      signingSecret: str('slack_bot_signing_secret'),
    },
    bots,
    pohodaImportID: str('pohoda_import_id'),
    google: {
      vl: {
        email: str('google_vl_email'),
        key: str('google_vl_key'),
      },
    },
  }
})
