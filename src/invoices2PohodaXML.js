import handlebars from 'handlebars'
import handlebarsIntl from 'handlebars-intl'

handlebarsIntl.registerWith(handlebars)

handlebars.registerHelper('XMLDate', (context) =>
  new Date(context).toISOString().slice(0, 10)
)

handlebars.registerHelper('Address', (context) => {
  let tokens = context.split(',')
  const street = tokens.shift()
  tokens = tokens[0]
  tokens = tokens.trim()
  tokens = tokens.split(' ')
  const zip = tokens.shift()
  const city = tokens.join(' ')
  return new handlebars.SafeString(`<typ:city>${city}</typ:city>
          <typ:street>${street}</typ:street>
          <typ:zip>${zip}</typ:zip>
         `)
})

const template = `
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" 
              xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd" 
              xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd" 
              id="reactive" 
              ico="48207497" 
              application="invoicer" 
              version="2.0" 
              note="Import FA">
    {{#each invoices}}
    <dat:dataPackItem id="{{invoicePrefix}}{{invoiceNumber}}" version="2.0">
            <inv:invoice version="2.0">
                <inv:invoiceHeader>
                    {{#if isReceived}}
                        <inv:invoiceType>receivedInvoice</inv:invoiceType>
                    {{else}}
                        <inv:invoiceType>issuedInvoice</inv:invoiceType>
                    {{/if}}
                    <inv:number>
                        <typ:numberRequested>{{invoicePrefix}}{{invoiceNumber}}</typ:numberRequested>
                    </inv:number>
                    <inv:symVar>{{invoicePrefix}}{{invoiceNumber}}</inv:symVar>
                    <inv:symConst></inv:symConst>
                    <inv:symSpec></inv:symSpec>
                    
                    <inv:date>{{XMLDate issueDate}}</inv:date>
                    <inv:dateTax>{{XMLDate issueDate}}</inv:dateTax>
                    <inv:dateAccounting>{{XMLDate issueDate}}</inv:dateAccounting>
                    <inv:dateDue>{{XMLDate paymentDate}}</inv:dateDue>
                    
                    <inv:text>Fakturujeme vám</inv:text>
                    
                    <inv:partnerIdentity>
                    {{#if isReceived}}
                        <typ:address>
                            <typ:company>{{vendorName}}</typ:company>
                            <typ:division></typ:division>
                            <typ:name>{{vendorName}}</typ:name>
                            {{Address vendorAddress}}
                            {{#if vendorID}}<typ:ico>{{vendorID}}</typ:ico>{{/if}}
                            {{#if vendorTaxID}}<typ:dic>{{vendorTaxID}}</typ:dic>{{/if}}
                            {{#if vendorVAT}}<typ:icDph>{{vendorVAT}}</typ:icDph>{{/if}}
                            <typ:phone></typ:phone>
                        </typ:address>
                        <typ:shipToAddress>
                            <typ:company></typ:company>
                            <typ:name></typ:name>
                            <typ:city></typ:city>
                            <typ:street></typ:street>
                            <typ:phone></typ:phone>
                        </typ:shipToAddress>
                    {{else}}
                        <typ:address>
                            <typ:company>{{clientName}}</typ:company>
                            <typ:division></typ:division>
                            <typ:name>{{clientName}}</typ:name>
                            {{Address clientAddress}}
                            {{#if clientID}}<typ:ico>{{clientID}}</typ:ico>{{/if}}
                            {{#if clientTaxID}}<typ:dic>{{clientTaxID}}</typ:dic>{{/if}}
                            {{#if clientVAT}}<typ:icDph>{{clientVAT}}</typ:icDph>{{/if}}
                            <typ:phone></typ:phone>
                        </typ:address>
                        <typ:shipToAddress>
                            <typ:company></typ:company>
                            <typ:name></typ:name>
                            <typ:city></typ:city>
                            <typ:street></typ:street>
                            <typ:phone></typ:phone>
                        </typ:shipToAddress>
                    {{/if}}
                    </inv:partnerIdentity>
                    
                    <inv:numberOrder></inv:numberOrder>
                    <inv:paymentType>
                        <typ:ids>Prevod</typ:ids>
                    </inv:paymentType>
                    <inv:account>
                        {{#if vendorIBAN}}<typ:accountNo>{{vendorIBAN}}</typ:accountNo>{{/if}}
                        {{#if vendorBIC}}<typ:bankCode>{{vendorBIC}}</typ:bankCode>{{/if}}
                    </inv:account>
                    
                    <inv:note>Import z XML</inv:note>
                    <inv:intNote>Tento doklad bol vytvorený importom zo XML.</inv:intNote>
                    <inv:centre>
                        <typ:ids></typ:ids>
                    </inv:centre>
                    <inv:activity>
                        <typ:ids></typ:ids>
                    </inv:activity>
                    <inv:contract>
                        <typ:ids></typ:ids>
                    </inv:contract>
                </inv:invoiceHeader>
                <inv:invoiceDetail>

                {{#services}}
                    <inv:invoiceItem>
                        <inv:text>{{name}}</inv:text>
                        <inv:quantity>1</inv:quantity>
                        {{#if vendorVATPayer}}<inv:rateVAT>high</inv:rateVAT>{{/if}}
                        <!--<inv:percentVAT>{{VATLevel}}</inv:percentVAT>-->
                        <inv:homeCurrency>
                            <typ:unitPrice>{{fullCost}}</typ:unitPrice>
                        </inv:homeCurrency>
                    </inv:invoiceItem>
                {{/services}}
                
                </inv:invoiceDetail>
            </inv:invoice>
        </dat:dataPackItem>
        
    {{/each}}
</dat:dataPack>
`

export default function invoices2PohodaXML(context) {
  return handlebars.compile(template)(context, {data: {intl: {
    locales: 'sk-SK',
  }}})
}
