export const deepErrorCause = (e: unknown) => {
  const message = []
  let error = e as Error | undefined
  while (error) {
    const indent = '  '.repeat(message.length)
    message.push(
      indent +
        (message.length === 0 ? '' : 'Caused by: ') +
        String(error)
          .replaceAll('\n', `\n${indent}`)
          .replaceAll(/\n +\n/g, '\n\n'),
    )
    error = error.cause as Error | undefined
  }
  return message.join('\n') + '\n'
}
