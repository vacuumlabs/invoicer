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

  return {
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
        text: `Yes, ${action} them all`,
      },
      deny: {
        type: 'plain_text',
        text: 'No',
      },
    },
    ...props[language].additionalFields,
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
