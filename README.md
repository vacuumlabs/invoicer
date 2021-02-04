# invoicer

## Configuration

- **bots_config** - there can be multiple bots configured to operate in different slack channels. Configuration of bots are separated by `;`. Each bot configuration consists of these values separated by `,`:
  - **channel ID** - slack channel ID for the bot
  - **storage root folder** - name of root folder where all invoices will be stored. Can be path with separator `/`
  - **storage user folder** - name of user folder where invoices of specific user are stored. This folder will be shared with the user. The name will be prepended with `<storage-root-folder>/<user-name>` and subfolders by year containing the invoices. Can be path with separator `/`
  - **admin emails** - list of admin emails separated by `+`. Base GDrive folder will be shared with these emails. Optionally can contain also type of account (user, group) and role (reader, writer, owner, commenter). Example: *fero@vacuumlabs.com:user:reader+finance@vacuumlabs.com:group:owner*. Default type: *user*, default role: *reader*. Only one admin can be owner

## Google Drive API

1. Create [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#creatinganaccount)
    - `Role` - can be left blank
    - `Furnish a new private key` - yes, JSON
    - `Enable G Suite Domain-wide Delegation` - not needed
1. [Enable Google Drive API](https://console.developers.google.com/apis/library)
1. Set `client_email` as `google_email` and `base64(private_key)` as `google_key`

## Deployment

App is deployed on Heroku. Every push to `master` is automatically deployed to production.
