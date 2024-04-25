/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-misused-promises */

import {zodResolver} from '@hookform/resolvers/zod'
import {ControllerProps, FieldPath, FieldValues, UseFormProps, useForm} from 'react-hook-form'
import {z} from 'zod'

import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form'
import {Input} from '@/components/ui/input'

const getInnerType = (schema: any) => {
  if (schema.unwrap) return schema.unwrap()
  if (schema._def.schema) return schema._def.schema
  if (schema._def.innerType) return schema._def.innerType
}

type SimpleFieldConfig = Readonly<{
  label?: string
  description?: string
  className?: string
  render?: undefined
}>

type RenderedFieldConfig<TFieldValues, TName> = Readonly<{
  readonly render?: ControllerProps<
    Extract<TFieldValues, FieldValues>,
    Extract<TName, FieldPath<Extract<TFieldValues, FieldValues>>>
  >['render']
}>

type FieldConfig<TFieldValues, TName> = SimpleFieldConfig | RenderedFieldConfig<TFieldValues, TName>

type FieldConfigs<T extends FieldValues> = {
  [K in keyof T]?: T[K] extends string | number | boolean ? FieldConfig<T, K> : FieldConfigs<T[K]>
}

export interface ZFormProps<Z extends z.ZodObject<any>> {
  schema: Z
  onSubmit: (values: z.infer<Z>) => void
  className?: string
  defaultValues?: UseFormProps<z.infer<Z>>['defaultValues']
  config?: FieldConfigs<z.infer<Z>>
}

export function ZForm<Z extends z.ZodObject<any>>(props: ZFormProps<Z>) {
  const configs = (props.config as Record<string, FieldConfig<any, any> | undefined>) || {}
  const form = useForm<z.infer<typeof props.schema>>({
    resolver: zodResolver(props.schema),
    defaultValues: props.defaultValues,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(props.onSubmit)} className={props.className}>
        {Object.entries(props.schema.shape as {}).map(([key, value]: [string, any]) => {
          if (configs[key]?.render) {
            return <FormField control={form.control} name={key as never} key={key} render={configs[key]!.render!} />
          }

          const config = (configs[key] as SimpleFieldConfig) || {}

          const label = config.label || key
          const description = config?.description || value.description
          let fieldSchema = value
          while (getInnerType(fieldSchema)) {
            fieldSchema = getInnerType(fieldSchema)
          }

          if (fieldSchema instanceof z.ZodString) {
            return (
              <FormField
                control={form.control}
                name={key as never}
                key={key}
                render={({field}) => (
                  <FormItem className={config?.className}>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    {description && <FormDescription>{description}</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )
          }

          if (fieldSchema instanceof z.ZodBoolean) {
            return (
              <FormField
                name={key as never}
                key={key}
                control={form.control}
                render={({field}) => {
                  return (
                    <FormItem key={key} className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked: boolean) => {
                            field.onChange(checked)
                            // return checked
                            //   ? void field.onChange([...field.value, key])
                            //   : void field.onChange((field.value as string[])?.filter(value => value !== key))
                          }}
                        />
                      </FormControl>
                      <FormLabel title={description} className="font-normal">
                        {label}
                      </FormLabel>
                    </FormItem>
                  )
                }}
              />
            )
          }

          throw new Error(`sdoidfj`)
        })}
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}
