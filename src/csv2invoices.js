import parse from 'csv-parse/lib/sync'

const columns = [
  'user', 'vendorName', 'vendorAddress', 'vendorID', 'vendorTaxID', 'vendorVAT',
  'vendorVATPayer', 'vendorIBAN', 'vendorBIC', 'clientName', 'clientAddress',
  'clientID',	'clientTaxID', 'clientVAT', 'issueDate', 'paymentDate', 'serviceName',
  'preTaxCost', 'VATLevel', 'VAT', 'fullCost', 'selfInvoicing',
]

export function csv2invoices(csv) {
  return parse(csv, {columns})
}
