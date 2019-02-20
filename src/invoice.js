import handlebars from 'handlebars'
import handlebarsIntl from 'handlebars-intl'

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
			text-align: right;
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
    <h1>{{#if isCreditNote}}Dobropis{{else}}Faktúra{{/if}} {{invoicePrefix}}{{invoiceNumber}}</h1>
    <div id="main">
      <div>
        <h2>Dodávateľ</h2>
				{{vendorName}}<br />
        {{vendorStreet}}<br />
        {{vendorZip}} {{vendorCity}}<br />
        {{vendorCountry}}
				<dl>
					{{#if vendorID}}<dt>IČO:</dt><dd>{{vendorID}}</dd>{{/if}}
					{{#if vendorTaxID}}<dt>DIČ:</dt><dd>{{vendorTaxID}}</dd>{{/if}}
					{{#if vendorVAT}}<dt>IČ DPH:</dt><dd>{{vendorVAT}}</dd>{{/if}}
					{{#if vendorIBAN}}<dt>IBAN:</dt><dd>{{vendorIBAN}}</dd>{{/if}}
					{{#if vendorBIC}}<dt>BIC:</dt><dd>{{vendorBIC}}</dd>{{/if}}
				</dl>
				
      </div>
      <div>
        <h2>Odberateľ</h2>
				{{clientName}}<br />
        {{clientStreet}}<br />
        {{clientZip}} {{clientCity}}<br />
        {{clientCountry}}
				<dl>
					{{#if clientID}}<dt>IČO:</dt><dd>{{clientID}}</dd>{{/if}}
					{{#if clientTaxID}}<dt>DIČ:</dt><dd>{{clientTaxID}}</dd>{{/if}}
					{{#if clientVAT}}<dt>IČ DPH:</dt><dd>{{clientVAT}}</dd>{{/if}}
				</dl>
      </div>
    </div>
		<div id="payment-terms">
			<dl>
				<dt>Dátum zdaniteľného plnenia: </dt><dd>{{formatDate issueDate day="numeric" month="long" year="numeric"}}</dd>
				<dt>Dátum vyhotovenia: </dt><dd>{{formatDate issueDate day="numeric" month="long" year="numeric"}}</dd>
				<dt>Dátum splatnosti: </dt><dd>{{formatDate paymentDate day="numeric" month="long" year="numeric"}}</dd>
			</dl>
		</div>
		<div id="services">
			<table>
				<thead><tr>
          <th style="text-align: left;">
            {{#if isCreditNote}}Dobropisujeme vám{{#if relatedInvoice}} ku faktúre č. {{relatedInvoice}}{{/if}}
            {{else}}Fakturujeme vám{{/if}}
          </th><th>Základ dane</th><th>% DPH</th><th>DPH</th><th>Celkom</th>
				</tr></thead>
				<tbody>{{#services}}<tr>
          <td style="width:50%;text-align: left;">{{name}}</td>
          <td>{{formatPrice preTaxCost ../currency}}</td>
          <td>{{formatNumber VATLevel style="percent"}}</td>
          <td>{{formatPrice VAT ../currency}}</td>
          <td>{{formatPrice fullCost ../currency}}</td>
        </tr>{{/services}}</tbody>
        <tfoot><tr>
          <td style="width:50%;text-align: left;">Celkom k úhrade ({{currency}})</td>
          <td>{{formatPrice preTaxCostSum currency}}</td>
          <td></td>
          <td>{{formatPrice VATSum currency}}</td>
          <td>{{formatPrice fullCostSum currency}}</td>
        </tr></tfoot>
			</table>
		</div>
		<div id="notes">
			{{#incomingInvoice}}<div>vyhotovenie {{#if isCreditNote}}dobropisu{{else}}faktúry{{/if}} odberateľom</div>{{/incomingInvoice}}
			{{^vendorVATPayer}}<div>dodávateľ nie je platcom DPH</div>{{/vendorVATPayer}}
      {{^domestic}}<div>{{#if isCreditNote}}Dobropis{{else}}Faktúra{{/if}} je v režime prenesenej daňovej povinnosti. Daň odvedie zákazník.</div>{{/domestic}}
      {{#if note}}<div>{{note}}</div>{{/if}}
		</div>

  </body>
</html>
`

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

export default function invoice(_context) {
  const context = {..._context}

  context.domestic = context.vendorCountry === context.clientCountry

  if (context.vendorID && context.vendorID.startsWith('@@')) {
    context.vendorID = null
  }

  return handlebars.compile(template)(context, {data: {intl: {
    locales: 'en-US',
  }}})
}
