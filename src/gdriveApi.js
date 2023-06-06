import path from 'path'
import logger from 'winston'
import {google} from 'googleapis'
import _ from 'lodash'


const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DEFAULT_PERM_TYPE = 'user'
const DEFAULT_PERM_ROLE = 'reader'

const drive = google.drive('v3')
const sheets = google.sheets({version: 'v4'})

const folderIdByPath = {}

export function init(googleConfig) {
  logger.log('verbose', 'gdrive - init')

  const key = Buffer.from(googleConfig.key, 'base64').toString()
  const auth = new google.auth.JWT(googleConfig.email, null, key, ['https://www.googleapis.com/auth/drive'])

  google.options({
    auth,
  })
}

export async function ensureFolder(folderPath, share = null) {
  logger.log('verbose', 'gdrive - ensureFolder', folderPath, share)


  if (folderIdByPath[folderPath]) {
    // confirm the folder wasn't deleted
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

  // shouldn't happen - we await `ensureFolder` on parent dir before calling this
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

export async function getForeignCurrencyRates() {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  logger.verbose('gdrive - read spreadsheet')

  // source google sheet for up-to-date currency rates
  // https://docs.google.com/spreadsheets/d/1HfaU9jXZtCfdotEEfDO0d4EpDLyhmqdepaWgn_a6Lsw/edit#gid=1807750274
  const fileId = '1HfaU9jXZtCfdotEEfDO0d4EpDLyhmqdepaWgn_a6Lsw'
  const today = new Date()
  const prevMonth = (today.getMonth() + 12 - 1) % 12
  const prevMonthYear = prevMonth === 11 ? today.getFullYear() - 1 : today.getFullYear()
  const sheetName =  `${monthNames[prevMonth]} ${prevMonthYear}` // e.g. 'Nov 2022'

  const {data:{values:rates}} = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range: `${sheetName}!A2:B50`,
  })

  // from:to ~ 1:value
  const rate = {
    EUR_EUR: 1,
    CZK_CZK: 1,
    HUF_HUF: 1,
    EUR_CZK: _.round(rates.find(([currency, rate]) => currency === 'CZK')[1], 4),
    EUR_HUF: _.round(rates.find(([currency, rate]) => currency === 'HUF')[1], 6),
  }
  rate.CZK_EUR = _.round(1 / rate.EUR_CZK, 4)
  rate.CZK_HUF = _.round(rate.EUR_HUF / rate.EUR_CZK, 6)
  rate.HUF_CZK = _.round(rate.EUR_CZK / rate.EUR_HUF, 4)
  rate.HUF_EUR = _.round(1 / rate.EUR_HUF, 4)

  logger.verbose('Using following rates today:')
  logger.verbose({rate})

  return rate
}
