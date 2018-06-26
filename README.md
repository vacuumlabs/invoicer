# invoicer

## Configuration

- **admin_emails** - comma separated list of admin emails. Base GDrive folder will be shared with these emails. Optionally can contain also type of account (user, group) and role (reader, writer, owner, commenter). Example: *fero@vacuumlabs.com:user:reader,finance@vacuumlabs.com:group:owner*. Default type: *user*, default role: *reader*. Only one admin can be owner.

## Google Drive API

1. Create [service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount#creatinganaccount)
    - `Role` - can be left blank
    - `Furnish a new private key` - yes, JSON
    - `Enable G Suite Domain-wide Delegation` - not needed
1. [Enable Google Drive API](https://console.developers.google.com/apis/library)
1. Upload private key with name `googleSecret.json` to the project root