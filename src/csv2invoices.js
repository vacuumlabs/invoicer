import parse from 'csv-parse/lib/sync'

const columns = [
  'user', 'slackId', 'invoicePrefix', 'invoiceNumber', 'vendorName',
  'vendorAddress', 'vendorID', 'vendorTaxID', 'vendorVAT', 'vendorVATPayer',
  'vendorIBAN', 'vendorBIC', 'clientName', 'clientAddress', 'clientID',
  'clientTaxID', 'clientVAT', 'issueDate', 'paymentDate', 'incomingInvoice',
]

const booleanColumns = ['incomingInvoice', 'vendorVATPayer']

const notRequired = ['user', 'slackId', 'vendorVAT']

function finRound(n) {
  return Math.round(n * 100 + 1e-6) / 100
}

function validDate(date) {

  if (isNaN(Date.parse(date))) {
    return false
  } else {
    if (date !== (new Date(date)).toISOString().substr(0, 10)) {
      return false
    }
  }
  return true
}

function validFixed2(number) {
  return (!isNaN(number) && number === parseFloat(number).toFixed(2))
}

// TODO: Parse float values + handle special case of authors.
export function csv2invoices(csv) {
  let error = ''
  const invoices = parse(csv).map((r, lineNumber) => {
    let i = 0
    const row = {services: [], preTaxCostSum: 0, VATSum: 0, fullCostSum: 0}
    for (; i < columns.length; i++) {
      row[columns[i]] = r[i]
      if (!row[columns[i]] && !(notRequired.includes(columns[i]))) {error += `Line ${lineNumber}: ${columns[i]} is required.\n`}
      if (columns[i] === 'vendorVATPayer' && row[columns[i]] && !row.vendorVAT) {error += `Line ${lineNumber}: vendorVAT is required if vendorVATPayer is true.\n`}
    }
    for (const k of booleanColumns) row[k] = row[k].toLowerCase() === 'true'
    if (isNaN(row.invoiceNumber)) error += `Line ${lineNumber}: invoiceNumber must be numeric.\n`
    if (!validDate(row.issueDate)) error += `Line ${lineNumber}: issueDate must be yyyy-mm-dd format.\n`
    if (!validDate(row.paymentDate)) error += `Line ${lineNumber}: paymentDate must be yyyy-mm-dd format.\n`

    for (; i < r.length; i += 3) {
      if (r[i] === '') break
      if (!validFixed2(r[i + 1])) error += `Line ${lineNumber}, item ${(i - columns.length) / 3 + 1}: preTaxCost must be in fixed-point with two digits after the decimal point format.\n`
      if (!validFixed2(r[i + 2])) error += `Line ${lineNumber}, item ${(i - columns.length) / 3 + 1}: VATLevel must be in fixed-point with two digits after the decimal point format.\n`
      const preTaxCost = parseFloat(r[i + 1])
      const VATLevel = parseFloat(r[i + 2])
      const VAT = finRound(preTaxCost * VATLevel)
      const fullCost = preTaxCost + VAT
      row.services.push({
        name: r[i], preTaxCost, VATLevel, VAT, fullCost,
      })
      row.preTaxCostSum += preTaxCost
      row.VATSum += VAT
      row.fullCostSum += fullCost
    }
    return row
  })
  if (error) throw error
  return invoices
}
