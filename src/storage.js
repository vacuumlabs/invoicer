import logger from 'winston'
import {ensureFolder, upsertFile} from './gdriveApi'
import {getInvoiceFileName} from './invoice'
import {init} from './google/init'


export async function initStorage(config, google) {
  logger.log('verbose', 'storage - initStorage')

  await init(google)
  await ensureFolder(config.rootFolder, config.adminEmails)

  logger.log('verbose', 'storage - initStorage - done')
}

export async function saveInvoice(invoice, stream, config) {
  const {user, email, paymentDate} = invoice
  const {rootFolder, userFolder, groupByYear} = config

  logger.log('verbose', 'storage - saveInvoice', user)

  const folderWithoutYear = `${rootFolder}/${user}/${userFolder}`

  await ensureFolder(folderWithoutYear, email && `${email}:anyone`)

  const fileName = getInvoiceFileName(invoice)
  const year = paymentDate.split('-')[0]
  const folder = `${folderWithoutYear}${groupByYear ? `/${year}` : ''}`

  const fileData = await upsertFile(fileName, folder, stream)

  logger.log('verbose', 'storage - saveInvoice - done', fileData.name)

  return fileData
}
