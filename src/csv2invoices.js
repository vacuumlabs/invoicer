import parse from 'csv-parse/lib/sync'

const columns = [
  'user', 'slackId', 'invoicePrefix', 'invoiceNumber', 'vendorName',
  'vendorAddress', 'vendorID', 'vendorTaxID', 'vendorVAT', 'vendorVATPayer',
  'vendorIBAN', 'vendorBIC', 'clientName', 'clientAddress', 'clientID',
  'clientTaxID', 'clientVAT', 'issueDate', 'paymentDate', 'isReceived',
]

const booleanColumns = ['isReceived', 'vendorVATPayer']

function finRound(n) {
  return Math.round(n * 100 + 1e-6) / 100
}

// TODO: Parse float values + handle special case of authors.
export function csv2invoices(csv) {
  return parse(csv).map((r) => {
    let i = 0
    const row = {services: [], preTaxCostSum: 0, VATSum: 0, fullCostSum: 0}
    for (; i < columns.length; i++) row[columns[i]] = r[i]
    for (const k of booleanColumns) row[k] = row[k].toLowerCase() === 'true'
    for (; i < r.length; i += 3) {
      if (r[i] === '') break
      const preTaxCost = finRound(parseFloat(r[i + 1]))
      const VATLevel = finRound(parseFloat(r[i + 2]))
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
}
