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

export async function ensureFolder(path, share = null) {
  if (folderIdByPath[path]) {
    const byId = await getById(folderIdByPath[path], true).catch((err) => {
      if (err.code === 404) { // stale cache
        return null
      }

      throw err
    })

    if (byId) {
      return folderIdByPath[path]
    }

    folderIdByPath[path] = null
  }

  const pathData = parsePath(path)

  if (pathData.folder) {
    await ensureFolder(pathData.folder)
  }

  const byName = await getByName(pathData.name, pathData.folder, true)

  if (byName) {
    const id = byName.id

    folderIdByPath[path] = id

    return id
  }

  const folderId = await createFolder(path, share)

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

function parsePath(path) {
  const slashIndex = path.lastIndexOf('/')
  const hasSlash = slashIndex !== -1

  return {
    name: hasSlash ? path.substring(slashIndex + 1) : path,
    folder: hasSlash ? path.substring(0, slashIndex) : '',
  }
}

async function createFolder(path, share = null) {
  let parentId = null

  const pathData = parsePath(path)

  if (pathData.folder) {
    parentId = folderIdByPath[pathData.folder] // caller must ensure that parent exists
  }

  const res = await drive.files.create({
    resource: {
      name: pathData.name,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentId].filter(Boolean),
    },
  })

  const folderId = res.data.id

  folderIdByPath[path] = folderId

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
