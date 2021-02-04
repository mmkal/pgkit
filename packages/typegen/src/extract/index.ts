import {Options} from '../types'
import {extractWithTypeScript} from './typescript'
import {extractSQLFile} from './sql'

export {extractSQLFile} from './sql'
export {extractWithTypeScript} from './typescript'

export const defaultExtractQueries: Options['extractQueries'] = file => {
  if (file.endsWith('.sql')) {
    return extractSQLFile(file)
  }
  return extractWithTypeScript(file)
}
