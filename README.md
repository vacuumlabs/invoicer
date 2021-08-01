# invoicer aka InvoiceBot

Creates, stores and sends invoices.

## Description

- admin uploads CSV file with invoices to administration Slack channel
- bot reads the file, responds with confirm/cancel buttons and links to download invoice in PDF or Pohoda XML file for every user
- in admin confirms, bot creates PDF invoices according to the input data and stores them on Google drive
  - bot creates folder for every user and (if enabled) folder for every year
- (if enabled) bot sends direct message on Slack to user with a link to PDF invoice on the Google drive
- bot responds to admin with list of users for which generating of invoice failed

## Configuration

- `bots_config` - there can be multiple bots configured to operate in different slack channels. Configuration of bots are separated by `;`. Each bot configuration consists of these values separated by `,`:
  - `channel ID` - administration Slack channel ID for the bot (where input CSV files are uploaded)
  - `storage root folder` - name of Google drive root folder where all invoices will be stored. Can be path with separator `/`
  - `storage user folder` - name of Google drive user folder where invoices of specific user are stored. This folder will be shared with the user. The name will be prepended with `<storage-root-folder>/<user-name>` and (if enabled) subfolders by year containing the invoices. Can be path with separator `/`
  - `admin emails` - list of admin emails separated by `+`. Root folder will be shared with these emails. Optionally can contain also type of account (user, group) and role (reader, writer, owner, commenter). Example: _fero@vacuumlabs.com:user:reader+finance@vacuumlabs.com:group:owner_. Default type: _user_, default role: _reader_. Only one admin can be owner
  - _sendOnSlack_ - 0/1 - send notification to invoice recipient on slack
  - _groupByYear_ - 0/1 - group invoices on gdrive by year
- `slack_bot_token` - bot user OAuth token from Slack app - menu Install App
- `pohoda_import_id` - import ID used in generated Pohoda XML file
- `host` - URL where the app is deployed

### Google service account

[Google API service account](https://cloud.google.com/docs/authentication/production#create_service_account) is needed to enable comunication with Google sheets. You need to [enable Google Drive API](https://console.developers.google.com/apis/library)

- `google_email` - email of the service account
- `google_key` - base64 encoded private key the service account (including the _-----BEGIN PRIVATE KEY-----_ and _-----END PRIVATE KEY-----_)

### Misc

- `NODE_ENV` _(optional, default - development)_
- `log_level` _(optional, default - debug if NODE_ENV is development, error otherwise)_ - winston level of logs that are written
- `PORT` - port number where server starts, provided by Heroku automatically

## Production environment

App is deployed to Heroku _https://dashboard.heroku.com/apps/vacuumlabs-invoicebot_ . Every merge to `master` is automatically deployed to production.

Slack app: [InvoiceBot](https://api.slack.com/apps/A96QM4M45)
