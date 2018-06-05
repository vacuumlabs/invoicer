# invoicer

## Configuration

- **admin_emails** - comma separated list of admin emails. Base GDrive folder will be shared with these emails. Optionally can contain also type of account (user, group) and role (reader, writer, owner, commenter). Example: *fero@vacuumlabs.com:user:reader,finance@vacuumlabs.com:group:owner*. Default type: *user*, default role: *writer*. Only one admin can be owner.