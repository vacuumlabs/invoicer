import {init, ensureFolder, upsertFile} from './gdriveApi'

const BASE_FOLDER = 'Invoices'
const USER_FOLDER = 'VL Invoices'

export async function initStorage(adminEmails) {
  await init()
  await ensureFolder(BASE_FOLDER, adminEmails)
}

export async function saveInvoice(invoice, stream) {
  const userFolder = `${BASE_FOLDER}/${invoice.user}/${USER_FOLDER}`

  await ensureFolder(userFolder, invoice.email || `${invoice.user}@vacuumlabs.com`)

  const name = `${invoice.user}-${invoice.invoiceNumber}.pdf`
  const year = invoice.paymentDate.split('-')[0]
  const folder = `${userFolder}/${year}`

  const fileData = await upsertFile(name, folder, stream)

  return fileData
}
