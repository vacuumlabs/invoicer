import {init, ensureFolder, upsertFile} from './gdriveApi'

const config = {
  rootFolder: '',
  userFolder: '',
}

export async function initStorage(adminEmails, _config) {
  config.rootFolder = _config.rootFolder
  config.userFolder = _config.userFolder
  Object.freeze(config)

  await init()
  await ensureFolder(config.rootFolder, adminEmails)
}

export async function saveInvoice(invoice, stream) {
  const userFolder = `${config.rootFolder}/${invoice.user}/${config.userFolder}`

  await ensureFolder(userFolder, `${invoice.email}:anyone`)

  const name = `${invoice.user}-${invoice.invoicePrefix}${invoice.invoiceNumber}.pdf`
  const year = invoice.paymentDate.split('-')[0]
  const folder = `${userFolder}/${year}`

  const fileData = await upsertFile(name, folder, stream)

  return fileData
}
