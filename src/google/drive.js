import path from 'path'
import logger from 'winston'
import {google} from 'googleapis'

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DEFAULT_PERM_TYPE = 'user'
const DEFAULT_PERM_ROLE = 'reader'

const drive = google.drive('v3')

const folderIdByPath = {}

// check whether a folder with `folderPath` exists.
// if not, create it and share it based on the `share` settings.
// note: `folderPath` is a full path from the service account's root My Drive
// return the folder's ID
export async function ensureFolder(folderPath, share = null) {
  logger.log('verbose', 'gdrive - ensureFolder', folderPath, share)

  let folderId = folderIdByPath[folderPath]
  if (folderId) {
    // confirm the folder still exists and is accessible
    const success = await confirmFolderId(folderId)
    if (success) return folderId
    else folderIdByPath[folderPath] = null
  }

  const {dir: parentPath, base: folderName} = path.parse(folderPath)

  // recursively call for missing parent folders and then start creating them from the top
  if (parentPath) await ensureFolder(parentPath)

  // parentPath is empty for top-level folder
  folderId = await getIdByName(folderName, parentPath, true)
  if (folderId) {
    folderIdByPath[folderPath] = folderId
    return folderId
  }

  folderId = await createFolder(folderPath, share)
  folderIdByPath[folderPath] = folderId
  logger.log('verbose', 'gdrive - ensureFolder - done', folderPath, folderId)

  return folderId
}

async function confirmFolderId(id) {
  logger.log('verbose', 'gdrive - confirmFolderId', id)

  try {
    await drive.files.get({fileId: id})
  } catch (err) {
    if (err.code === 404) return false

    logger.log('error', 'gdrive - confirmFolderId', err)
    throw err
  }

  return true
}

async function getIdByName(name, parentPath, isFolder = false) {
  logger.log('verbose', 'gdrive - getIdByName', name, parentPath, isFolder)

  const parentId = parentPath && folderIdByPath[parentPath]

  // shouldn't happen - we await `ensureFolder` on parent dir before calling this
  if (parentPath && !parentId) return null

  try {
    const res = await drive.files.list({
      q: `mimeType ${isFolder ? '=' : '!='} '${FOLDER_MIME_TYPE}' and name = '${name}' and '${parentId || 'root'}' in parents and trashed = false`,
      orderBy: 'modifiedByMeTime desc',
    })

    const files = res.data.files
    if (files.length === 0) {
      logger.verbose('gdrive - getIdByName - no file found', name, parentPath, isFolder)
      return null
    }
    if (files.length > 1) logger.warn('gdrive - getIdByName - more than one file found, picking first', name, parentPath, isFolder, files)

    return files[0].id
  } catch (err) {
    logger.log('error', 'gdrive - getIdByName', err)
    throw err
  }
}

async function shareItem(id, shareData) {
  logger.log('verbose', 'gdrive - shareItem', id, shareData)

  for (let i = 0; i < shareData.length; i++) {
    const {role, type, emailAddress} = shareData[i]

    try {
      await drive.permissions.create({
        fileId: id,
        requestBody: {
          role,
          type,
          emailAddress,
          // https://developers.google.com/drive/api/guides/manage-sharing#transfer-consumer-account
          ...(role === 'owner' ? {pendingOwner: true} : {}),
        },
      })
    } catch (err) {
      logger.log('error', 'gdrive - shareItem', err)
      throw err
    }
  }

  logger.log('verbose', 'gdrive - shareItem - done', id, shareData)
}

async function createFolder(folderPath, share = null) {
  logger.log('verbose', 'gdrive - createFolder', folderPath, share)

  const {dir, base} = path.parse(folderPath)

  const parentId = dir === '' ? null : folderIdByPath[dir] // caller must ensure that parent exists

  try {
    const res = await drive.files.create({
      resource: {
        name: base,
        mimeType: FOLDER_MIME_TYPE,
        parents: parentId ? [parentId] : [],
      },
    })

    const folderId = res.data.id

    if (share) {
      await shareItem(folderId, share.split('+').reduce((acc, shareData) => {
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
  } catch (err) {
    logger.log('error', 'gdrive - createFolder', err)
    throw err
  }
}

export async function upsertFile(name, folder, content) {
  logger.log('verbose', 'gdrive - upsertFile', name, folder)

  const folderId = await ensureFolder(folder)
  const fileIdByName = await getIdByName(name, folder)

  try {
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

    logger.log('verbose', 'gdrive - upsertFile - done', name, folder)

    return {
      name,
      url: file.data.webViewLink || `https://drive.google.com/open?id=${file.data.id}`,
    }
  } catch (err) {
    logger.log('error', 'gdrive - upsertFile', err)
    throw err
  }
}
