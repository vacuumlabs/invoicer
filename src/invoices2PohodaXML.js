import handlebars from 'handlebars'
import c from './config'
import _ from 'lodash'

handlebars.registerHelper('XMLDate', (context) =>
  new Date(context).toISOString().slice(0, 10)
)

handlebars.registerHelper('toFixed2', (context) =>
  context.toFixed(2)
)

const template = `
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" 
              xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" 
              xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" 
              id="${c.pohodaImportID}" 
              ico="{{myID}}" 
              application="invoicer" 
              version="2.0" 
              note="Import FA">
    {{#each invoices}}
    <dat:dataPackItem id="{{vendorID}}-{{invoicePrefix}}{{invoiceNumber}}" version="2.0">
            <inv:invoice version="2.0">
                <inv:invoiceHeader>
                    <inv:originalDocument>{{invoicePrefix}}{{invoiceNumber}}</inv:originalDocument>
                    <inv:symVar>{{symVar}}</inv:symVar>
                    {{#if isReceived}}
                        <inv:invoiceType>receivedInvoice</inv:invoiceType>
                    {{else}}
                        <inv:invoiceType>issuedInvoice</inv:invoiceType>
                    {{/if}}
                    <inv:date>{{XMLDate issueDate}}</inv:date>
                    <inv:dateTax>{{XMLDate issueDate}}</inv:dateTax>
                    <inv:dateAccounting>{{XMLDate issueDate}}</inv:dateAccounting>
                    <inv:dateDue>{{XMLDate paymentDate}}</inv:dateDue>
                    
                    <inv:text>Fakturujeme vám</inv:text>
                    
                    <inv:partnerIdentity>
                    <typ:address>
                        <typ:company>{{partner.name}}</typ:company>
                        <typ:name>{{partner.name}}</typ:name>
                        <typ:city>{{partner.city}}</typ:city>
                        <typ:street>{{partner.street}}</typ:street>
                        <typ:zip>{{partner.zip}}</typ:zip>
                        {{#if partner.ID}}<typ:ico>{{partner.ID}}</typ:ico>{{/if}}
                        {{#if partner.taxID}}<typ:dic>{{partner.taxID}}</typ:dic>{{/if}}
                        {{#if partner.VAT}}
                          <typ:icDph>{{partner.VAT}}</typ:icDph>
                        {{else}}
                          <typ:icDph>0</typ:icDph>
                        {{/if}}
                    </typ:address>
                    </inv:partnerIdentity>
                    
                    <inv:paymentType>
                      <typ:paymentType>draft</typ:paymentType>
                    </inv:paymentType>

                    {{#if partner.IBAN}}
                    <inv:paymentAccount>{{partner.IBAN}}</inv:paymentAccount>
                    {{/if}}
                    
                    <inv:note>
                        {{#isReceived}}vyhotovenie faktúry odberateľom{{/isReceived}}
                        {{^vendorVATPayer}}dodávateľ nie je platcom DPH{{/vendorVATPayer}}
                    </inv:note>
                    <inv:intNote>Tento doklad bol vytvorený importom zo XML.</inv:intNote>
                    
                </inv:invoiceHeader>
                <inv:invoiceDetail>

                {{#services}}
                    <inv:invoiceItem>
                        <inv:text>{{name}}</inv:text>
                        <inv:quantity>1</inv:quantity>
                        {{#if vendorVATPayer}}<inv:rateVAT>high</inv:rateVAT>{{/if}}
                        <inv:percentVAT>{{toFixed2 VATLevel}}</inv:percentVAT>
                        <inv:homeCurrency>
                            <typ:unitPrice>{{toFixed2 fullCost}}</typ:unitPrice>
                        </inv:homeCurrency>
                    </inv:invoiceItem>
                {{/services}}
                
                </inv:invoiceDetail>
            </inv:invoice>
        </dat:dataPackItem>
        
    {{/each}}
</dat:dataPack>
`

export default function invoices2PohodaXML(invoices) {
  const inv = invoices.invoices[0]
  invoices.myID = inv.isReceived ? inv.clientID : inv.vendorID
  for (const invoice of invoices.invoices) {
    const partnerKeys = ['name', 'city', 'street', 'zip', 'ID', 'taxID', 'VAT', 'IBAN', 'BIC']
    const partnerType = invoice.isReceived ? 'vendor' : 'client'
    const partner = {}
    for (const k of partnerKeys) {
      partner[k] = invoice[`${partnerType}${_.upperFirst(k)}`]
    }
    invoice.partner = partner

    invoice.symVar = (invoice.invoicePrefix + invoice.invoiceNumber).match(/\d+$/)[0]
  }
  console.log(invoices)
  return handlebars.compile(template)(invoices)
}
