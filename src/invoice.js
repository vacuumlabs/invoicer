import handlebars from 'handlebars'
import handlebarsIntl from 'handlebars-intl'
import {shortNames} from './routes'
import contentDisposition from 'content-disposition'
import logger from 'winston'
import pdf from 'html-pdf'

handlebarsIntl.registerWith(handlebars)

const template = `
<html>
  <style>
		body {
			font: 10px Helvetica;
			padding: 2em 3em;
			line-height: 1.3;
		}

		table {
			width: 100%;	
			font: 10px Helvetica;
			line-height: 1.3;
			text-align: left;
		}

		h1 {
			margin-left: 12px;
		}

		#main {
			border-top: 1px solid black;
			border-bottom: 1px solid black;
		}

		#payment-terms {
			padding-left: 12px;
			border-bottom: 1px solid black;
		}

    #payment-terms dt {
      width: 30%;
    }

		#services {
			padding: 6px 0px 6px 12px;
			border-bottom: 1px solid black;
		}

		#notes {
			padding-left: 12px;
			font-style: italic;
		}

    #freeNote {
      white-space: pre-wrap;
    }

		#main > :first-child {
			border-right: 1px solid black;
		}

		#main > :last-child {
			border-left: 1px solid black;
			margin-left: -1px;
		}

    #main > div {
      float: left;
      width: 50%;
			box-sizing: border-box;
			padding: 0px 12px;
    }

    #main::after {
			content:"";
			display:table;
      clear: both;
    }

		dl::after {
			content: "";
			display: table;
			clear: both;
		}

		dd, dt {
			display: inline-block;
			margin: 0;
			padding: 0;
		}

		dt {
			clear: left;
			float: left;
			width: 20%;
			font-weight: bold;
			text-align: left;
		}

		dd {
		  float: left;
			max-width: 70%;
			text-align: left;
			padding-left: 0.5em;
		}

    th, td {
      text-align: right;
    }

    table {
      border-collapse: collapse;
    }

    tfoot {
      border-top: 2px solid black;
      font-weight: bold;
    }

  </style>
  <body>
    <h1>
      {{#if customTitle}}
        {{customTitle}}
      {{else if isCreditNote}}
        {{texts.titleCreditNote}}
      {{else}}
        {{texts.titleInvoice}}
      {{/if}}
      {{invoicePrefix}}{{invoiceNumber}}
    </h1>
    <div id="main">
      <div>
        <h2>{{texts.supplier}}</h2>
				{{vendorName}}<br />
        {{vendorStreet}}<br />
        {{vendorZip}} {{vendorCity}}<br />
        {{vendorCountry}}
				<dl>
					{{#if vendorID}}<dt>{{texts.companyId}}:</dt><dd>{{vendorID}}</dd>{{/if}}
					{{#if vendorTaxID}}<dt>{{texts.taxId}}:</dt><dd>{{vendorTaxID}}</dd>{{/if}}
					{{#if vendorVAT}}<dt>{{texts.vatId}}:</dt><dd>{{vendorVAT}}</dd>{{/if}}
					{{#if vendorIBAN}}<dt>IBAN:</dt><dd>{{vendorIBAN}}</dd>{{/if}}
					{{#if vendorBIC}}<dt>BIC:</dt><dd>{{vendorBIC}}</dd>{{/if}}
				</dl>
				
      </div>
      <div>
        <h2>{{texts.customer}}</h2>
				{{clientName}}<br />
        {{clientStreet}}<br />
        {{clientZip}} {{clientCity}}<br />
        {{clientCountry}}
				<dl>
					{{#if clientID}}<dt>{{texts.companyId}}:</dt><dd>{{clientID}}</dd>{{/if}}
					{{#if clientTaxID}}<dt>{{texts.taxId}}:</dt><dd>{{clientTaxID}}</dd>{{/if}}
					{{#if clientVAT}}<dt>{{texts.vatId}}:</dt><dd>{{clientVAT}}</dd>{{/if}}
				</dl>
      </div>
    </div>
		<div id="payment-terms">
			<dl>
				<dt>{{texts.taxDate}}: </dt><dd>{{formatDate deliveryDate day="numeric" month="long" year="numeric"}}</dd>
				<dt>{{texts.createDate}}: </dt><dd>{{formatDate issueDate day="numeric" month="long" year="numeric"}}</dd>
				<dt>{{texts.dueDate}}: </dt><dd>{{formatDate paymentDate day="numeric" month="long" year="numeric"}}</dd>
			</dl>
		</div>
		<div id="services">
			<table>
				<thead><tr>
          <th style="text-align: left;">
            {{#if isCreditNote}}
              {{#if relatedInvoice}}
                {{texts.weCreditYouForInvoice}} {{relatedInvoice}}
              {{else}}
                {{texts.weCreditYou}}
              {{/if}}
            {{else}}
              {{texts.weInvoiceYou}}
            {{/if}}
          </th>
          <th>{{texts.taxBase}}</th>
          <th>{{texts.taxRate}}</th>
          <th>{{texts.tax}}</th>
          <th>{{texts.itemTotal}}</th>
				</tr></thead>
				<tbody>{{#services}}<tr>
          <td style="width:50%;text-align: left;">{{name}}</td>
          <td>{{formatPrice preTaxCost ../currency}}</td>
          <td>{{formatNumber VATLevel style="percent"}}</td>
          <td>{{formatPrice VAT ../currency}}</td>
          <td>{{formatPrice fullCost ../currency}}</td>
        </tr>{{/services}}</tbody>
        <tfoot><tr>
          <td style="width:50%;text-align: left;">{{texts.totalToPay}} ({{currency}})</td>
          <td>{{formatPrice preTaxCostSum currency}}</td>
          <td></td>
          <td>{{formatPrice VATSum currency}}</td>
          <td>{{formatPrice fullCostSum currency}}</td>
        </tr></tfoot>
			</table>
		</div>
		<div id="notes">
			{{#incomingInvoice}}
        <div>
          {{#if isCreditNote}}
            {{texts.selfCreditNote}}
          {{else}}
            {{texts.selfInvoice}}
          {{/if}}
        </div>
      {{/incomingInvoice}}
			{{#unless vendorVATPayer}}
        {{#if vendorIsCzech}}
          {{#if clientIsCzech}}
            <div>{{texts.notTaxPayerCZVendorAndClient}}</div>
          {{else}}
            <div>{{texts.notTaxPayerCZVendorAndClientNot}}</div>
          {{/if}}
        {{else}}
          <div>{{texts.notTaxPayerSK}}</div>
        {{/if}}
      {{/unless}}
      {{#unless domestic}}
        <div>
          {{#if isCreditNote}}
            {{texts.taxPaysCustomerCreditNote}}
          {{else}}
            {{texts.taxPaysCustomerInvoice}}
          {{/if}}
        </div>
      {{/unless}}
      {{#if note}}<div id="freeNote">{{note}}</div>{{/if}}
		</div>
  </body>
</html>
`

const texts = {
  SK: {
    titleCreditNote: 'Dobropis',
    titleInvoice: 'Faktúra',
    titleAdvanceInvoice: 'Zálohová faktúra',
    supplier: 'Dodávateľ',
    companyId: 'IČO',
    taxId: 'DIČ',
    vatId: 'IČ DPH',
    customer: 'Odberateľ',
    taxDate: 'Dátum zdaniteľného plnenia',
    createDate: 'Dátum vyhotovenia',
    dueDate: 'Dátum splatnosti',
    weCreditYou: 'Dobropisujeme vám',
    weCreditYouForInvoice: 'Dobropisujeme vám ku faktúre č.',
    weInvoiceYou: 'Fakturujeme vám',
    taxBase: 'Základ dane',
    taxRate: '% DPH',
    tax: 'DPH',
    itemTotal: 'Celkom',
    totalToPay: 'Celkom k úhrade',
    selfInvoice: 'Vyhotovenie faktúry odberateľom',
    selfCreditNote: 'Vyhotovenie dobropisu odberateľom',
    notTaxPayerSKVendor: 'Dodávateľ nie je platcom DPH podľa § 4 zákona o DPH č. 222/2004 Z.z.',
    notTaxPayerCZVendorAndClient: 'Dodávateľ nie je platcom DPH.',
    notTaxPayerCZVendorAndClientNot: 'Dodávateľ je identifikovaná osoba pre účely DPH.',
    taxPaysCustomerInvoice: 'Faktúra je v režime prenesenej daňovej povinnosti. Daň odvedie zákazník.',
    taxPaysCustomerCreditNote: 'Dobropis je v režime prenesenej daňovej povinnosti. Daň odvedie zákazník.',
  },
  EN: {
    titleCreditNote: 'Credit Note',
    titleInvoice: 'Invoice',
    titleAdvanceInvoice: 'Proforma invoice',
    supplier: 'Supplier',
    companyId: 'ID',
    taxId: 'TAX ID',
    vatId: 'VAT ID',
    customer: 'Customer',
    taxDate: 'Date of delivery',
    createDate: 'Date',
    dueDate: 'Due date',
    weCreditYou: 'Description',
    weCreditYouForInvoice: 'Credit note for invoice n.',
    weInvoiceYou: 'Description',
    taxBase: 'Base',
    taxRate: '% VAT',
    tax: 'VAT',
    itemTotal: 'Total',
    totalToPay: 'Total due',
    selfInvoice: 'Invoice created by customer',
    selfCreditNote: 'Credit note created by customer',
    notTaxPayerSKVendor: 'Supplier is not a VAT payer.',
    notTaxPayerCZVendorAndClient: 'Supplier is not a VAT payer.',
    notTaxPayerCZVendorAndClientNot: 'Supplier is an identified person for VAT purposes.',
    taxPaysCustomerInvoice: 'The delivery of service takes place in a different EU member state. The person responsible for tax payment is the recipient.',
    taxPaysCustomerCreditNote: 'The delivery of service takes place in a different EU member state. The person responsible for tax payment is the recipient.',
  },
}

const customTypeTitleMap = {
  issuedInvoice: 'titleInvoice',
  issuedCreditNotice: 'titleCreditNote',
  issuedAdvanceInvoice: 'titleAdvanceInvoice',
}

const priceFormatters = {
  EUR: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
  }),
  CZK: {
    format: (value) => `${(new Intl.NumberFormat('cs')).format(value)} Kč`,
  },
  HUF: {
    format: (value) => `${(new Intl.NumberFormat('hu')).format(value)} Ft`,
  },
}

handlebars.registerHelper('formatPrice', (value, currency) => priceFormatters[currency].format(value))

const domesticCountries = ['The United States of America', 'United Kingdom']

export const isDomestic = (vendorCountry, clientCountry) =>
  vendorCountry === clientCountry ||
  domesticCountries.includes(clientCountry) ||
  clientCountry.includes('US')

export default function renderInvoice(_context, language) {
  const context = {..._context}

  context.vendorIsCzech = context.vendorCountry === 'Czech Republic'
  context.clientIsCzech = context.clientCountry === 'Czech Republic'

  context.domestic = isDomestic(context.vendorCountry, context.clientCountry)

  if (context.vendorID && context.vendorID.startsWith('@@')) {
    context.vendorID = null
  }

  context.texts = texts[language] || texts.SK
  context.customTitle = context.invoiceType && customTypeTitleMap[context.invoiceType]
    ? context.texts[customTypeTitleMap[context.invoiceType]]
    : null

  return handlebars.compile(template)(context, {data: {intl: {
    locales: 'en-US',
  }}})
}

export const getInvoiceFileName = (invoice) => `${invoice.user || invoice.clientName}-${invoice.vendorID}-${invoice.invoicePrefix}${invoice.invoiceNumber}.pdf`

export function query2invoice(query) {
  const invoice = query.id ? {...shortNames[query.id]} : JSON.parse(query.invoice)
  invoice.deliveryDate = Date.parse(invoice.deliveryDate)
  invoice.issueDate = Date.parse(invoice.issueDate)
  invoice.paymentDate = Date.parse(invoice.paymentDate)
  return invoice
}

export function invoiceHandler(req, res) {
  const invoiceData = query2invoice(req.query)
  const htmlInvoice = renderInvoice(invoiceData, req.query.lang)
  pdf
    .create(htmlInvoice, {format: 'A4'})
    .toBuffer((err, buffer) => {
      if (err) logger.warn('PDF conversion failed')
      const fileName = getInvoiceFileName(invoiceData)
      res.setHeader('Content-Disposition', contentDisposition(fileName))
      res.status(200).send(buffer)
    })
}
