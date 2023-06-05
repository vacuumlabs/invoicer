import logger from 'winston'
import {init, ensureFolder, upsertFile} from './gdriveApi'


export async function initStorage(config, google) {
  logger.log('verbose', 'storage - initStorage')

  await init(google)
  await ensureFolder(config.rootFolder, config.adminEmails)

  logger.log('verbose', 'storage - initStorage - done')
}

export async function saveInvoice(invoice, stream, config) {
  const {user, email, invoicePrefix, invoiceNumber, paymentDate} = invoice
  const {rootFolder, userFolder, groupByYear} = config

  logger.log('verbose', 'storage - saveInvoice', user)

  const folderWithoutYear = `${rootFolder}/${user}/${userFolder}`

  await ensureFolder(userFolder, email && `${email}:anyone`)

  const name = `${user}-${invoicePrefix}${invoiceNumber}.pdf`
  const year = paymentDate.split('-')[0]
  const folder = `${folderWithoutYear}${groupByYear ? `/${year}` : ''}`

  const fileData = await upsertFile(name, folder, stream)

  logger.log('verbose', 'storage - saveInvoice - done', fileData.name)

  return fileData
}
