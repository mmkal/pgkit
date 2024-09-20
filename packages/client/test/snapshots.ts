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
        const keys = ['name', ...Object.getOwnPropertyNames(value).filter(p => p !== 'stack')]
        return Object.fromEntries(keys.map(k => [k, value[k]]))
      }
      if (key === 'dataTypeID' || key === 'tableID') {
        return `[${key}]` // avoid unstable pg generated ids
      }
      if (this.name === 'error' && key === 'line') {
        return `[${key}]` // avoid unstable line numbers of generated statements
      }
      return value
    },
    2,
  )
  return [message, props].filter(Boolean).join('\n')
}
