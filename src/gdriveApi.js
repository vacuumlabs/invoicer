import path from 'path'
import {google} from 'googleapis'
import _ from 'lodash'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DEFAULT_PERM_TYPE = 'user'
const DEFAULT_PERM_ROLE = 'reader'

const drive = google.drive('v3')

const folderIdByPath = {}

export async function init() {
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  google.options({
    auth,
  })
}

export async function ensureFolder(folderPath, share = null) {
  if (folderIdByPath[folderPath]) {
    folderIdByPath[folderPath] = await confirmFolderId(folderIdByPath[folderPath])
  }

  if (folderIdByPath[folderPath]) return folderIdByPath[folderPath]

  const {dir, base} = path.parse(folderPath)

  if (dir !== '') await ensureFolder(dir)

  folderIdByPath[folderPath] = await getIdByName(base, dir, true)

  if (folderIdByPath[folderPath]) return folderIdByPath[folderPath]

  const folderId = await createFolder(folderPath, share)

  folderIdByPath[folderPath] = folderId

  return folderId
}

export async function upsertFile(name, folder, content) {
  const folderId = await ensureFolder(folder)
  const fileIdByName = await getIdByName(name, folder)

  const file = await (
    fileIdByName
      ? drive.files.update({
        fileId: fileIdByName,
        resource: {
          name,
        },
        media: {
          body: content,
        },
        fields: 'id,webViewLink',
      })
      : drive.files.create({
        resource: {
          name,
          parents: [folderId],
        },
        media: {
          body: content,
        },
        fields: 'id,webViewLink',
      })
  )

  return {
    name,
    url: file.data.webViewLink || `https://drive.google.com/open?id=${file.data.id}`,
  }
}

async function createFolder(folderPath, share = null) {
  const {dir, base} = path.parse(folderPath)

  const parentId = dir === '' ? null : folderIdByPath[dir] // caller must ensure that parent exists

  const res = await drive.files.create({
    resource: {
      name: base,
      mimeType: FOLDER_MIME_TYPE,
      parents: parentId ? [parentId] : [],
    },
  })

  const folderId = res.data.id

  if (share) {
    await shareItem(folderId, share.split(',').reduce((acc, shareData) => {
      const [emailAddress, type, role] = shareData.split(':')

      if (type === 'anyone') {
        acc.push({ // sends email with invitation
          role: role || DEFAULT_PERM_ROLE,
          type: DEFAULT_PERM_TYPE,
          emailAddress,
        }, { // enables reading by link
          role: 'reader',
          type,
        })
      } else {
        acc.push({
          role: role || DEFAULT_PERM_ROLE,
          type: type || DEFAULT_PERM_TYPE,
          emailAddress,
        })
      }

      return acc
    }, []))
  }

  return folderId
}

async function confirmFolderId(id) {
  const res = await drive.files.get({
    fileId: id,
  }).catch((err) => {
    if (err.code === 404) {
      return null
    }

    throw err
  })

  return _.get(res, 'data.id')
}

async function getIdByName(name, parentPath, isFolder = false) {
  const parentId = parentPath && folderIdByPath[parentPath]

  if (parentPath && !parentId) return null

  const res = await drive.files.list({
    q: `mimeType ${isFolder ? '=' : '!='} '${FOLDER_MIME_TYPE}' and name = '${name}'${parentId ? ` and '${parentId}' in parents` : ''}`,
    orderBy: 'modifiedByMeTime desc',
  })

  return _.get(res, 'data.files[0].id')
}

async function shareItem(id, shareData) {
  for (let i = 0; i < shareData.length; i++) {
    const {role, type, emailAddress} = shareData[i]

    await drive.permissions.create({
      fileId: id,
      transferOwnership: role === 'owner',
      requestBody: {
        role,
        type,
        emailAddress,
      },
    })
  }
}
