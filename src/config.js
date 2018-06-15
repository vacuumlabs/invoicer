import transenv from 'transenv'
export default transenv()(({str, bool, num}) => {
  const env = str('NODE_ENV', 'development')
  const isDevelopment = env === 'development'

  return {
    env,
    logLevel: str('log_level', isDevelopment ? 'debug' : 'error'),
    port: str('PORT'),
    host: str('host'),
    invoicingChannel: str('invoicing_channel'),
    slack: {
      botToken: str('slack_bot_token'),
    },
    pohodaImportID: str('pohoda_import_id'),
    adminEmails: str('admin_emails'),
  }
})
