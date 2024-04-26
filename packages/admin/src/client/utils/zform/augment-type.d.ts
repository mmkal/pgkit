import {InputHTMLAttributes} from 'react'
import * as _z from 'zod'

declare module 'zod' {
  type ReactHookFormControllerProps<T, K = never> = import('react-hook-form').ControllerProps<T, K>
  type ReactHookFormRender<T, K = never> = ReactHookFormControllerProps<T, K>['render']
  type ReactHookFormFieldRenderProps<T, K = never> = Parameters<ReactHookFormRender<T, K>>[0]

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
    Renderer?: <X>(
      props: ReactHookFormFieldRenderProps<X> & {
        // props: Parameters<import('react-hook-form').ControllerProps<X, never>['render']>[0] & {
        children: React.ReactNode
      },
    ) => React.ReactNode
    Wrapper?: (props: {children: React.ReactNode}) => React.ReactNode

    // render?: (props: FieldRenderProps<T>) => React.ReactElement
  }
  interface ZodType {
    _fieldConfig?: ZodTypeFieldConfig
    field(config: ZodTypeFieldConfig): this
  }
}
