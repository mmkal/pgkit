import * as _z from 'zod'

declare module 'zod' {
  interface ZodTypeFieldConfig {
    label?: string
    description?: string
    defaultValue?: unknown
    className?: string
  }
  interface ZodType {
    _fieldConfig?: ZodTypeFieldConfig
    field(config: ZodTypeFieldConfig): this
  }
}
