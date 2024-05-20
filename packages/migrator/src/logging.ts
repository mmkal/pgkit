type LogMessage = Record<string, unknown>
const createMessageFormats = <T extends Record<string, (msg: LogMessage) => [string, LogMessage]>>(formats: T) =>
  formats

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-base-to-string */
const MESSAGE_FORMATS = createMessageFormats({
  created(msg) {
    const {event, path, ...rest} = msg
    return [`created   ${path}`, rest]
  },
  migrating(msg) {
    const {event, name, ...rest} = msg
    return [`migrating ${name}`, rest]
  },
  migrated(msg) {
    const {event, name, durationSeconds, ...rest} = msg
    return [`migrated  ${name} in ${durationSeconds} s`, rest]
  },
  reverting(msg) {
    const {event, name, ...rest} = msg
    return [`reverting ${name}`, rest]
  },
  reverted(msg) {
    const {event, name, durationSeconds, ...rest} = msg
    return [`reverted  ${name} in ${durationSeconds} s`, rest]
  },
  up(msg) {
    const {event, message, ...rest} = msg
    return [`up migration completed, ${message}`, rest]
  },
  down(msg) {
    const {event, message, ...rest} = msg
    return [`down migration completed, ${message}`, rest]
  },
})
function isProperEvent(event: unknown): event is keyof typeof MESSAGE_FORMATS {
  return typeof event === 'string' && event in MESSAGE_FORMATS
}

export type Logger = Pick<typeof console, 'info' | 'warn' | 'error'>

/* eslint-enable @typescript-eslint/restrict-template-expressions */
export function prettifyAndLog(level: keyof Logger, message: LogMessage): void {
  const {event} = message || {}
  /* eslint-disable no-console */
  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
  if (!isProperEvent(event)) return void console[level](message)

  const [messageStr, rest] = MESSAGE_FORMATS[event](message)
  console[level](messageStr)

  if (Object.keys(rest).length > 0) console[level](rest)
}
