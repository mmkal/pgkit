import {InputHTMLAttributes} from 'react'
import * as _z from 'zod'

declare module 'zod' {
  type ReactHookFormControllerProps<T> = import('react-hook-form').ControllerProps<{x: T}, 'x'>
  type ReactHookFormRender<T> = ReactHookFormControllerProps<T>['render']
  type ReactHookFormFieldRenderProps<T> = Parameters<ReactHookFormRender<T>>[0]

  type FieldRenderProps<T> = ReactHookFormFieldRenderProps<T> & {
    Base: ReactHookFormRender<T>
  }
  interface ZodTypeFieldConfig<T = unknown> {
    label?: string
    input?: InputHTMLAttributes<HTMLInputElement>
    // type?: string
    // placeholder?: string
    description?: string
    defaultValue?: unknown
    className?: string
    render?: (props: FieldRenderProps<T>) => React.ReactElement
  }
  interface ZodType {
    _fieldConfig?: ZodTypeFieldConfig
    field(config: ZodTypeFieldConfig): this
  }
}
