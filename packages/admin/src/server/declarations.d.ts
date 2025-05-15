declare module 'pg-query-emscripten' {
  export type ParsedPGStatement = {
    stmt?: {}
    stmt_len?: number
    stmt_location?: number
  }
  type PgQueryEmscriptenParseError = {
    message: string
    funcname: string
    filename: string
    lineno: number
    cursorpos: number
    context: string
  }

  export type PgQueryEmscriptenParseResult = {
    parse_tree: {version: number; stmts: ParsedPGStatement[]}
    stderr_buffer: string
    error: null | PgQueryEmscriptenParseError
  }
  export type PgQueryEmscriptenInstance = {
    parse(query: string): PgQueryEmscriptenParseResult
  }
  declare const Module: new () => Promise<PgQueryEmscriptenInstance>
  export default Module
}
