import React from 'react'
import {z} from 'zod'
import {ZForm} from './form'
import {Button, ButtonProps} from '@/components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'

export * from './form'

export function useZForm<T extends z.ZodType>({schema}: {schema: T}) {
  const [values, setValues] = React.useState<z.infer<T> | null>()
  const [active, setActive] = React.useState(false)

  return {values, setValues, schema, active, setActive}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PopoverZFormProps<T extends z.ZodObject<any>> extends ButtonProps {
  onSubmit: (values: z.infer<T>) => void
  schema: T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PopoverZFormButton<T extends z.ZodObject<any>>({onSubmit, schema, ...props}: PopoverZFormProps<T>) {
  const [values, setValues] = React.useState<z.infer<T> | null>()
  const [active, setActive] = React.useState(false)

  return (
    <Popover open={active} onOpenChange={open => setActive(open)}>
      <PopoverTrigger onClick={() => setActive(old => !old)}>
        <Button {...props}></Button>
      </PopoverTrigger>
      <PopoverContent>
        <ZForm
          schema={schema}
          useFormProps={{defaultValues: (values as never) || {}}}
          onTouch={v => setValues(v)}
          onSubmit={v => {
            onSubmit(v)
            setActive(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
