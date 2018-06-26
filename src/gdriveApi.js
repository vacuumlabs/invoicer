import path from 'path'
import logger from 'winston'
import {google} from 'googleapis'
import _ from 'lodash'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DEFAULT_PERM_TYPE = 'user'
const DEFAULT_PERM_ROLE = 'reader'

const drive = google.drive('v3')

const folderIdByPath = {}

export async function init() {
  logger.log('verbose', 'gdrive - init')

  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(process.cwd(), 'googleSecret.json')

  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/drive'],
  }).catch((err) => {
    logger.log('error', 'gdrive - init', err)
    throw err
  })

  google.options({
    auth,
  })
}

export async function ensureFolder(folderPath, share = null) {
  logger.log('verbose', 'gdrive - ensureFolder', folderPath)

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

  logger.log('verbose', 'gdrive - ensureFolder - done', folderPath, folderId)

  return folderId
}

export async function upsertFile(name, folder, content) {
  logger.log('verbose', 'gdrive - upsertFile', name, folder)

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
  ).catch((err) => {
    logger.log('error', 'gdrive - upsertFile', err)
    throw err
  })

  logger.log('verbose', 'gdrive - upsertFile - done', name, folder)

  return {
    name,
    url: file.data.webViewLink || `https://drive.google.com/open?id=${file.data.id}`,
  }
}

async function createFolder(folderPath, share = null) {
  logger.log('verbose', 'gdrive - createFolder', folderPath, share)

  const {dir, base} = path.parse(folderPath)

  const parentId = dir === '' ? null : folderIdByPath[dir] // caller must ensure that parent exists

  const res = await drive.files.create({
    resource: {
      name: base,
      mimeType: FOLDER_MIME_TYPE,
      parents: parentId ? [parentId] : [],
    },
  }).catch((err) => {
    logger.log('error', 'gdrive - createFolder', err)
    throw err
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

  logger.log('verbose', 'gdrive - createFolder - done', folderPath, share, folderId)

  return folderId
}

async function confirmFolderId(id) {
  logger.log('verbose', 'gdrive - confirmFolderId', id)

  const res = await drive.files.get({
    fileId: id,
  }).catch((err) => {
    if (err.code === 404) {
      return null
    }

    logger.log('error', 'gdrive - confirmFolderId', err)
    throw err
  })

  return _.get(res, 'data.id')
}

async function getIdByName(name, parentPath, isFolder = false) {
  logger.log('verbose', 'gdrive - getIdByName', name, parentPath, isFolder)

  const parentId = parentPath && folderIdByPath[parentPath]

  if (parentPath && !parentId) return null

  const res = await drive.files.list({
    q: `mimeType ${isFolder ? '=' : '!='} '${FOLDER_MIME_TYPE}' and name = '${name}'${parentId ? ` and '${parentId}' in parents` : ''}`,
    orderBy: 'modifiedByMeTime desc',
  }).catch((err) => {
    logger.log('error', 'gdrive - getIdByName', err)
    throw err
  })

  return _.get(res, 'data.files[0].id')
}

async function shareItem(id, shareData) {
  logger.log('verbose', 'gdrive - shareItem', id, shareData)

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
    }).catch((err) => {
      logger.log('error', 'gdrive - shareItem', err)
      throw err
    })
  }

  logger.log('verbose', 'gdrive - shareItem - done', id, shareData)
}
