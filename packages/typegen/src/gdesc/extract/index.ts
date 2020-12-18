import {dumbExtractQueries} from './dumb'
import {GdescriberParams} from '../types'
import {extractWithTypeScript} from './typescript'
import {extractSQLFile} from './sql'

// codegen:start {preset: barrel}
export * from './dumb'
export * from './sql'
export * from './typescript'
// codegen:end

export const defaultExtractQueries: GdescriberParams['extractQueries'] = file => {
  if (file.endsWith('.sql')) {
    return extractSQLFile(file)
  }
  try {
    return extractWithTypeScript(file)
  } catch (e) {
    if (e?.code !== 'MODULE_NOT_FOUND') {
      throw e
    }
    console.warn(
      `Failed to extract using typescript. Doing simple parsing with RegExps instead. Install typescript for more robust parsing.`,
    )
    return dumbExtractQueries(file)
  }
}
