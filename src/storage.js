import logger from 'winston'
import {init, ensureFolder, upsertFile} from './gdriveApi'

const config = {
  rootFolder: '',
  userFolder: '',
}

export async function initStorage(adminEmails, _config) {
  logger.log('verbose', 'storage - initStorage')

  config.rootFolder = _config.rootFolder
  config.userFolder = _config.userFolder
  Object.freeze(config)

  await init()
  await ensureFolder(config.rootFolder, adminEmails)

  logger.log('verbose', 'storage - initStorage - done')
}

export async function saveInvoice(invoice, stream) {
  logger.log('verbose', 'storage - saveInvoice', invoice.user)

  const userFolder = `${config.rootFolder}/${invoice.user}/${config.userFolder}`

  await ensureFolder(userFolder, `${invoice.email}:anyone`)

  const name = `${invoice.user}-${invoice.invoicePrefix}${invoice.invoiceNumber}.pdf`
  const year = invoice.paymentDate.split('-')[0]
  const folder = `${userFolder}/${year}`

  const fileData = await upsertFile(name, folder, stream)

  logger.log('verbose', 'storage - saveInvoice - done', fileData.name)

  return fileData
}
