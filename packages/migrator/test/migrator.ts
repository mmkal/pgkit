import {Migrator as Base} from '../src'

type Log = (message: any) => void
const createLogger = (create: (level: string) => Log) => ({
  debug: create('debug'),
  info: create('info'),
  warn: create('warn'),
  error: create('error'),
})

export const noopLogger = createLogger(_level => _message => {})

/** extends the base Migrator class to default to a no-op logger, to reduce test stdout noise */
export class Migrator extends Base {
  constructor(params: ConstructorParameters<typeof Base>[0]) {
    super({logger: noopLogger, ...params})
  }
}
