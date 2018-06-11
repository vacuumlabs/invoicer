import path from 'path'
import {google} from 'googleapis'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DEFAULT_PERM_TYPE = 'user'
const DEFAULT_PERM_ROLE = 'writer'

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
    folderIdByPath[folderPath] = await confirmFolderId(folderIdByPath[folderPath]).catch((err) => {
      if (err.code === 404) { // stale cache; clean-up and continue
        return null
      }

      throw err
    })
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
      })
      : drive.files.create({
        resource: {
          name,
          parents: [folderId],
        },
        media: {
          body: content,
        },
      })
  )

  return {
    name,
    url: `https://drive.google.com/file/d/${file.data.id}/view`,
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
    share.split(',').map(async (shareData) => {
      const [emailAddress, type, role] = shareData.split(':')

      await drive.permissions.create({
        fileId: folderId,
        transferOwnership: role === 'owner',
        requestBody: {
          role: role || DEFAULT_PERM_ROLE,
          type: type || DEFAULT_PERM_TYPE,
          emailAddress,
        },
      })
    })
  }

  return folderId
}

async function confirmFolderId(id) {
  const res = await drive.files.get({
    fileId: id,
  })

  return res.data && res.data.id
}

async function getIdByName(name, parentPath, isFolder = false) {
  const parentId = parentPath && folderIdByPath[parentPath]

  if (parentPath && !parentId) return null

  const res = await drive.files.list({
    q: `mimeType ${isFolder ? '=' : '!='} '${FOLDER_MIME_TYPE}' and name = '${name}'${parentId ? ` and '${parentId}' in parents` : ''}`,
    orderBy: 'modifiedByMeTime desc',
  })

  return res.data.files[0] && res.data.files[0].id
}
