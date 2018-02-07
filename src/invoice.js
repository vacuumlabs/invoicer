import mustache from 'mustache'

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

		#services {
			padding-left: 12px;
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

  </style>
  <body>
    <h1>Faktúra {{invoiceNumber}}</h1>
    <div id="main">
      <div>
        <h2>Dodávateľ</h2>
				{{vendorName}}<br />
				{{vendorAddress}}
				<dl>
					{{#vendorID}}<dt>IČO:</dt><dd>{{vendorID}}</dd>{{/vendorID}}
					{{#vendorTaxID}}<dt>DIČ:</dt><dd>{{vendorTaxID}}</dd>{{/vendorTaxID}}
					{{#vendorVAT}}<dt>IČ DPH:</dt><dd>{{vendorVAT}}</dd>{{/vendorVAT}}
					{{#vendorIBAN}}<dt>IBAN:</dt><dd>{{vendorIBAN}}</dd>{{/vendorIBAN}}
					{{#vendorBIC}}<dt>BIC:</dt><dd>{{vendorBIC}}</dd>{{/vendorBIC}}
				</dl>
				
      </div>
      <div>
        <h2>Odberateľ</h2>
				{{clientName}}<br />
				{{clientAddress}}
				<dl>
					{{#clientID}}<dt>IČO:</dt><dd>{{clientID}}</dd>{{/clientID}}
					{{#clientTaxID}}<dt>DIČ:</dt><dd>{{clientTaxID}}</dd>{{/clientTaxID}}
					{{#clientVAT}}<dt>IČ DPH:</dt><dd>{{clientVAT}}</dd>{{/clientVAT}}
				</dl>
      </div>
    </div>
		<div id="payment-terms">
			<dl>
				<dt>Dátum vyhotovenia: </dt><dd>{{issueDate}}</dd>
				<dt>Dátum splatnosti: </dt><dd>{{paymentDate}}</dd>
			</dl>
		</div>
		<div id="services">
			<table>
				<thead><tr>
					<th>Fakturujeme vám</th><th>Základ dane</th><th>% DPH</th><th>DPH</th><th>Celkom</th>
				</tr></thead>
				<tbody><tr>
					<td style="width:50%;">{{serviceName}}</td><td>{{preTaxCost}}</td><td>{{VATLevel}}</td><td>{{VAT}}</td><td>{{fullCost}}</td>
				</tr>
			</table>
		</div>
		<div id="notes">
			{{#selfInvoicing}}<div>vyhotovenie faktúry odberateľom</div>{{/selfInvoicing}}
			{{^vendorVATPayer}}<div>dodávateľ nie je platcom DPH</div>{{/vendorVATPayer}}
		</div>

  </body>
</html>
`
export default function invoice(data) {
  return mustache.render(template, data)
}
