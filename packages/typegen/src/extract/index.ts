import {Options} from '../types'
import {extractSQLFile} from './sql'
import {extractWithTypeScript} from './typescript'

export {extractSQLFile} from './sql'
export {extractWithTypeScript} from './typescript'

export const defaultExtractQueries: Options['extractQueries'] = file => {
  if (file.endsWith('.sql')) {
    return extractSQLFile(file)
  }

  return extractWithTypeScript(file)
}
