import {BLOCK_ID_HOME, FINANCE_BOT_ID, MAINTAINER_ID} from './constants'

export const ACTION_ID_SEND_SK = 'send_sk'
export const ACTION_ID_SEND_EN = 'send_en'
export const ACTION_ID_VL_BOT = 'vl_bot'
export const ACTION_ID_WINCENT_BOT = 'wincent_bot'
export const ACTION_ID_CANCEL = 'cancel'

/**
 * @param {string} text
 * @returns {import('@slack/bolt').HeaderBlock}
 */
export const getHeaderBlock = (text) => ({
  type: 'header',
  text: {
    type: 'plain_text',
    text,
  },
})

/**
 * @param {string} text
 * @returns {import('@slack/bolt').SectionBlock}
 */
export const getSectionBlock = (text) => ({
  type: 'section',
  text: {
    type: 'mrkdwn',
    text,
  },
})

/**
 * @param {string} text
 * @returns {import('@slack/bolt').ContextBlock}
 */
export const getContextBlock = (text) => ({
  type: 'context',
  elements: [
    {
      type: 'mrkdwn',
      text,
    },
  ],
})

/**
* @param {{
    action_id?: import('@slack/bolt').Button['action_id']
    text: string
    style?: import('@slack/bolt').Button['style']
    url?: import('@slack/bolt').Button['url']
  }} buttonInfo
 * @returns {import('@slack/bolt').Button}
 */
export const getButton = ({action_id, text, style, url}) => ({
  type: 'button',
  action_id,
  text: {
    type: 'plain_text',
    text,
  },
  style,
  url,
})

/**
 * @returns {import('@slack/bolt').ActionsBlock}
 */
export const getActionsBlock = ({block_id, elements}) => ({
  type: 'actions',
  block_id,
  elements,
})

/**
 * @returns {import('@slack/bolt').Button}
 */
export const sendInvoicesButton = (invoicesLength, language) => {
  const action = 'upload and send'
  const capitalizedAction = 'Upload and send'
  const props = {
    SK: {
      buttonLabel: `${capitalizedAction} ${invoicesLength} invoices`,
      actionId: ACTION_ID_SEND_SK,
      confirmationQuestion: `Do you really want to ${action} these Slovak invoices?`,
      additionalFields: {
        style: 'primary',
      },
    },
    EN: {
      buttonLabel: `${capitalizedAction} ${invoicesLength} invoices (EN)`,
      actionId: ACTION_ID_SEND_EN,
      confirmationQuestion:
        `Do you really want to ${action} these English invoices?`,
    },
  }

  const config = props[language]

  return {
    type: 'button',
    text: {
      type: 'plain_text',
      text: config.buttonLabel,
    },
    action_id: config.actionId,
    value: language,
    confirm: {
      title: {
        type: 'plain_text',
        text: 'Are you sure?',
      },
      text: {
        type: 'plain_text',
        text: config.confirmationQuestion,
      },
      confirm: {
        type: 'plain_text',
        text: `Yes, ${action} them all`,
      },
      deny: {
        type: 'plain_text',
        text: 'No',
      },
    },
    ...config.additionalFields,
  }
}

/**
 * @returns {import('@slack/bolt').Button}
 */
export const cancelButton = () => getButton({
  action_id: ACTION_ID_CANCEL,
  text: 'Cancel',
  style: 'danger',
})

/**
 * @type import('@slack/bolt').HomeView['blocks']
 */
export const HOME_BLOCKS = [
  getHeaderBlock('Welcome to InvoiceBot!'),
  getSectionBlock('The finance department is sending invoices through me.'),
  getSectionBlock(`In case of any trouble with your invoices, please contact the finance department through <@${FINANCE_BOT_ID}>.`),
  getSectionBlock(`In case of technical issues with the bot, feel free to contact the maintainer (currently - <@${MAINTAINER_ID}>).`),
  getActionsBlock({
    block_id: BLOCK_ID_HOME,
    elements: [
      getButton({
        text: 'Check my invoices in Messages',
        url: 'slack://app?team=T026LE24D&id=A96QM4M45&tab=messages',
      }),
    ],
  }),
]
