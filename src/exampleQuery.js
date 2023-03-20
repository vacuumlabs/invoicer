export const exampleQuery = {
   invoicePrefix: 'VAC17',
   invoiceNumber: '0007',
   vendorName: 'vacuumlabs s.r.o.',
   vendorAddress: 'Radlinského 10, 81107 Bratislava',
   vendorID: '48207497',
   vendorTaxID: '2120112962',
   vendorVAT: 'SK2120112962',
   vendorVATPayer: false,
   vendorIBAN: 'SK8809000000000494005548',
   vendorBIC: 'GIBASKBX',
   clientName: 'Samuel Hapák IT',
   clientAddress: 'Brančská 7, 85105 Bratislava',
   clientID: '50509527',
   clientTaxID: '1080786630',
   clientVAT: 'CZ2120112962',
   deliveryDate: Date.parse('2022-12-08'),
   issueDate: Date.parse('2017-11-07'),
   paymentDate: Date.parse('2017-11-15'),
   services: [{
     name: 'Prenájom pracovného priestoru za júl 2017',
     preTaxCost: 41.67,
     VATLevel: 0.2,
     VAT: 8.33,
     fullCost: 50.00,
   },
   {
     name: 'Odmena za vytvorenie diela',
     preTaxCost: 100.34,
     VATLevel: 0.16,
     VAT: 8.99,
     fullCost: 3810.10,
   }],
   preTaxCostSum: 141.81,
   VATSum: 19.00,
   fullCostSum: 151.23,
   incomingInvoice: true,
 }
