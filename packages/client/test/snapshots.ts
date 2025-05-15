export function printError(val: any): string {
  const message = val instanceof Error ? `[${val.constructor.name}]: ${val.message}` : undefined
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

export function printErrorCompact(val: any): string {
  if (!(val instanceof Error)) {
    return printError(val)
  }
  const lines: string[] = []
  let e = val as Error | undefined
  while (e) {
    const message = e.message
    lines.push(`${'  '.repeat(lines.length)}${lines.length ? 'Caused by: ' : ''}[${e.constructor.name}]: ${message}`)
    e = e.cause as Error | undefined
  }
  return lines.join('\n')
}
