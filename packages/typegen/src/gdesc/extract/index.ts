import {GdescriberParams} from '../types'
import {extractWithTypeScript} from './typescript'
import {extractSQLFile} from './sql'

// codegen:start {preset: barrel}
export * from './sql'
export * from './typescript'
// codegen:end

export const defaultExtractQueries: GdescriberParams['extractQueries'] = file => {
  if (file.endsWith('.sql')) {
    return extractSQLFile(file)
  }
  return extractWithTypeScript(file)
}
