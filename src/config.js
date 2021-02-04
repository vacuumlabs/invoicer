import transenv from 'transenv'
export default transenv()(({str, bool, num}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  const bots = str('bots_config').split(';').reduce((acc, botData) => {
    const fields = botData.split(',')

    if (fields.length !== 5) {
      throw new Error(`Invalid bot config - ${botData}`)
    }

    const [channel, storageRootFolder, storageUserFolder, adminEmails, sendOnSlack] = fields

    acc[channel] = {
      channel,
      storage: {
        adminEmails,
        rootFolder: storageRootFolder,
        userFolder: storageUserFolder,
      },
      sendOnSlack: sendOnSlack && sendOnSlack !== "0",
    }

    return acc
  }, {})

  return {
    env,
    logLevel: str('log_level', isDevelopment ? 'debug' : 'error'),
    port: str('PORT'),
    host: str('host'),
    slack: {
      botToken: str('slack_bot_token'),
    },
    bots,
    pohodaImportID: str('pohoda_import_id'),
    google: {
      email: str('google_email'),
      key: str('google_key'),
    },
  }
})
