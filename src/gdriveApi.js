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
    const byId = await getById(folderIdByPath[folderPath], true).catch((err) => {
      if (err.code === 404) { // stale cache
        return null
      }

      throw err
    })

    if (byId) {
      return folderIdByPath[folderPath]
    }

    folderIdByPath[folderPath] = null
  }

  const {dir, base} = path.parse(folderPath)

  if (dir) {
    await ensureFolder(dir)
  }

  const byName = await getByName(base, dir, true)

  if (byName) {
    const id = byName.id

    folderIdByPath[folderPath] = id

    return id
  }

  const folderId = await createFolder(folderPath, share)

  return folderId
}

export async function upsertFile(name, folder, content) {
  const folderId = await ensureFolder(folder)
  const byName = await getByName(name, folder)

  let file

  if (byName) {
    file = await drive.files.update({
      fileId: byName.id,
      resource: {
        name,
      },
      media: {
        body: content,
      },
    })
  } else {
    file = await drive.files.create({
      resource: {
        name,
        parents: [folderId],
      },
      media: {
        body: content,
      },
    })
  }

  return {
    name,
    url: `https://drive.google.com/file/d/${file.data.id}/view`,
  }
}

async function createFolder(folderPath, share = null) {
  let parentId = null

  const {dir, base} = path.parse(folderPath)

  if (dir) {
    parentId = folderIdByPath[dir] // caller must ensure that parent exists
  }

  const res = await drive.files.create({
    resource: {
      name: base,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentId].filter(Boolean),
    },
  })

  const folderId = res.data.id

  folderIdByPath[folderPath] = folderId

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

async function getById(id, expectFolder = false) {
  const res = await drive.files.get({
    fileId: id,
  })

  const isFolder = res.data.mimeType === FOLDER_MIME_TYPE

  if (isFolder !== expectFolder) {
    return null
  }

  return res.data
}

async function getByName(name, path, isFolder = false) {
  let parentId = null

  if (path) {
    parentId = folderIdByPath[path]

    if (!parentId) {
      return null
    }
  }

  const res = await drive.files.list({
    q: `mimeType ${isFolder ? '=' : '!='} '${FOLDER_MIME_TYPE}' and name = '${name}'${parentId ? ` and '${parentId}' in parents` : ''}`,
    orderBy: 'modifiedByMeTime desc',
  })

  return res.data.files[0]
}
