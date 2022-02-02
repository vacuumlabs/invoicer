export const ACTION_ID_SEND_SK = 'send_sk'
export const ACTION_ID_SEND_EN = 'send_en'
export const ACTION_ID_CANCEL = 'cancel'

export const sectionBlock = (textType, text) => {
  return {
    type: 'section',
    text: {
      type: textType,
      text,
    },
  }
}

export const sendInvoicesButton = (invoicesLength, language) => {
  const props = {
    SK: {
      buttonLabel: `Send ${invoicesLength} invoices`,
      actionId: ACTION_ID_SEND_SK,
      confirmationQuestion: 'Do you really want to send these Slovak invoices?',
      additionalFields: {
        style: 'primary',
      },
    },
    EN: {
      buttonLabel: `Send ${invoicesLength} invoices (EN)`,
      actionId: ACTION_ID_SEND_EN,
      confirmationQuestion:
        'Do you really want to send these English invoices?',
    },
  }

  return {
    ...props[language].additionalFields,
    ...{
      type: 'button',
      text: {
        type: 'plain_text',
        text: props[language].buttonLabel,
      },
      action_id: props[language].actionId,
      value: language,
      confirm: {
        title: {
          type: 'plain_text',
          text: 'Are you sure?',
        },
        text: {
          type: 'plain_text',
          text: props[language].confirmationQuestion,
        },
        confirm: {
          type: 'plain_text',
          text: 'Yes, send them all',
        },
        deny: {
          type: 'plain_text',
          text: 'No',
        },
      },
    },
  }
}

export const cancelButton = () => {
  return {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'Cancel',
    },
    action_id: ACTION_ID_CANCEL,
    style: 'danger',
  }
}
