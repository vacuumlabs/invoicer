import parse from 'csv-parse/lib/sync'
import {getForeignCurrencyRates} from './google/sheets'

const countryToCurrency = {
  Slovakia: 'EUR',
  Czechia: 'CZK',
  Hungary: 'HUF',
}

const columns = [
  'user', 'slackId', 'email', 'invoicePrefix', 'invoiceNumber', 'relatedInvoice', 'vendorName',
  'vendorStreet', 'vendorCity', 'vendorZip', 'vendorCountry', 'vendorID', 'vendorTaxID',
  'vendorVAT', 'vendorVATPayer', 'vendorIBAN', 'vendorBIC', 'clientName',
  'clientStreet', 'clientCity', 'clientZip', 'clientCountry', 'clientID', 'clientTaxID',
  'clientVAT', 'deliveryDate', 'issueDate', 'paymentDate', 'isReceived', 'note', 'currency',
]

const booleanColumns = ['isReceived', 'vendorVATPayer']

const additionalColumns = ['invoiceType', 'currencyRate', 'totalRounding', 'isPL']

function finRound(n) {
  return Math.round(n * 100 + 1e-6) / 100
}

// TODO: Parse float values + handle special case of authors.
export async function csv2invoices(csv) {
  const rate = await getForeignCurrencyRates()
  return parse(csv).map((r) => {
    let i = 0
    let currencyRate
    const row = {services: [], preTaxCostSum: 0, VATSum: 0, fullCostSum: 0}

    // copy data of first 30 columns from `r` as object properties of `row`
    for (; i < columns.length; i++) row[columns[i]] = r[i]
    // rewrite booleans in lowercase
    for (const k of booleanColumns) row[k] = row[k].toLowerCase() === 'true'

    let hasNewItemsFormat = true
    for (; i < r.length; i += 4) {
      // new format is determined by '' at r[30]
      if (r[i] === '') break
      hasNewItemsFormat = false
      const preTaxCost = finRound(parseFloat(r[i + 1]))
      const VATLevel = finRound(parseFloat(r[i + 2]))
      const VAT = finRound(preTaxCost * VATLevel)
      // calculates the full cost
      const fullCost = preTaxCost + VAT
      row.services.push({
        name: r[i], preTaxCost, VATLevel, VAT, fullCost, showFullCost: false,
      })
      row.preTaxCostSum += preTaxCost
      row.VATSum += VAT
      row.fullCostSum += fullCost
      const clientCurrency = countryToCurrency[row.clientCountry] ?? 'EUR'
      if (clientCurrency !== row.currency) {
        currencyRate = rate[`${row.currency}_${clientCurrency}`]
      }
    }
    // move to next value (after the empty one)
    i++ // 31 if new format
    if (hasNewItemsFormat) {
      for (; i < r.length; i += 4) {
        if (r[i] === '') break
        const preTaxCost = finRound(parseFloat(r[i + 1]))
        const VATLevel = finRound(parseFloat(r[i + 2]))
        const VAT = finRound(preTaxCost * VATLevel)
        // reads the full cost
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
    // move to next value (after the empty one)
    i++
    // load additional columns
    for (let j = 0; j < additionalColumns.length; i++, j++) row[additionalColumns[j]] = r[i]
    row.currencyRate = currencyRate ?? row.currencyRate
    return row
  })
}
