import parse from 'csv-parse/lib/sync'

const columns = [
  'user', 'slackId', 'email', 'invoicePrefix', 'invoiceNumber', 'relatedInvoice', 'vendorName',
  'vendorStreet', 'vendorCity', 'vendorZip', 'vendorCountry', 'vendorID', 'vendorTaxID',
  'vendorVAT', 'vendorVATPayer', 'vendorIBAN', 'vendorBIC', 'clientName',
  'clientStreet', 'clientCity', 'clientZip', 'clientCountry', 'clientID', 'clientTaxID',
  'clientVAT', 'issueDate', 'paymentDate', 'isReceived', 'note', 'currency',
]

const booleanColumns = ['isReceived', 'vendorVATPayer']

const additionalColumns = ['invoiceType', 'currencyRate', 'totalRounding', 'isPL']

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
    let hasNewItemsFormat = true
    for (; i < r.length; i += 4) {
      if (r[i] === '') break
      hasNewItemsFormat = false
      const preTaxCost = finRound(parseFloat(r[i + 1]))
      const VATLevel = finRound(parseFloat(r[i + 2]))
      const VAT = finRound(preTaxCost * VATLevel)
      const fullCost = preTaxCost + VAT
      row.services.push({
        name: r[i], preTaxCost, VATLevel, VAT, fullCost, showFullCost: false,
      })
      row.preTaxCostSum += preTaxCost
      row.VATSum += VAT
      row.fullCostSum += fullCost
    }
    i++;
    if (hasNewItemsFormat) {
      for (; i < r.length; i += 4) {
        if (r[i] === '') break
        const preTaxCost = finRound(parseFloat(r[i + 1]))
        const VATLevel = finRound(parseFloat(r[i + 2]))
        const VAT = finRound(preTaxCost * VATLevel)
        const fullCost = finRound(parseFloat(r[i + 3]))
        row.services.push({
          name: r[i], preTaxCost, VATLevel, VAT, fullCost, showFullCost: true,
        })
        row.preTaxCostSum += preTaxCost
        row.VATSum += VAT
        row.fullCostSum += fullCost
      }
    }
    row.isCreditNote = row.fullCostSum < 0
    i++;
    for (let j = 0; j < additionalColumns.length; i++, j++) row[additionalColumns[j]] = r[i]
    return row
  })
}
