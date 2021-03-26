import logger from 'winston'
import {init, ensureFolder, upsertFile} from './gdriveApi'


export async function initStorage(config, google) {
  logger.log('verbose', 'storage - initStorage')

  await init(google)
  await ensureFolder(config.rootFolder, config.adminEmails)

  logger.log('verbose', 'storage - initStorage - done')
}

export async function saveInvoice(invoice, stream, config) {
  logger.log('verbose', 'storage - saveInvoice', invoice.user)

  const userFolder = `${config.rootFolder}/${invoice.user}/${config.userFolder}`

  await ensureFolder(userFolder, invoice.email && `${invoice.email}:anyone`)

  const name = `${invoice.user}-${invoice.invoicePrefix}${invoice.invoiceNumber}.pdf`
  const year = invoice.paymentDate.split('-')[0]
  const folder = `${userFolder}${config.groupByYear ? `/${year}` : ''}`

  const fileData = await upsertFile(name, folder, stream)

  logger.log('verbose', 'storage - saveInvoice - done', fileData.name)

  return fileData
}
