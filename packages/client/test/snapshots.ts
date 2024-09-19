import {isValidationErrorLike} from 'zod-validation-error'

export function printError(val: any): string {
  const message = val instanceof Error ? `[${val.constructor.name}]: ${val.message}` : undefined
  if (message && isValidationErrorLike(val)) {
    return message
  }
  const props = JSON.stringify(
    val,
    function reviver(this: any, key, value: any) {
      if (value?.constructor?.name?.endsWith('Error')) {
        const keys = Object.getOwnPropertyNames(value).filter(p => p !== 'stack' && p !== 'message')
        return Object.fromEntries(keys.map(k => [k, value[k]]))
      }
      if (key === 'dataTypeID' || key === 'tableID') {
        return 123_456_789 // avoid unstable pg generated ids
      }
      if (this.name === 'error' && key === 'line') {
        return '123456789' // avoid unstable line numbers of generated statements
      }
      return value
    },
    2,
  )
  return [message, props].filter(Boolean).join('\n')
}
