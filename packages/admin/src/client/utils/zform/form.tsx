/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-misused-promises */

import './augment-prototype'

import {zodResolver} from '@hookform/resolvers/zod'
import React from 'react'
import {ControllerProps, FieldPath, FieldValues, UseFormProps, useFieldArray, useForm} from 'react-hook-form'
import {z} from 'zod'

import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from '@/components/ui/form'
import {Input} from '@/components/ui/input'

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

export interface ZFormProps<Z extends z.ZodObject<any>> extends UseFormProps<z.infer<Z>> {
  schema: Z
  onSubmit: (values: z.infer<Z>) => void
  className?: string
  config?: FieldConfigs<z.infer<Z>>
}

export function ZForm<Z extends z.ZodObject<any>>(props: ZFormProps<Z>) {
  const form = useForm<z.infer<typeof props.schema>>({
    resolver: zodResolver(props.schema),
    defaultValues: props.defaultValues,
  })
  const reflected = React.useMemo(() => zreflect(props.schema), [props.schema])

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(props.onSubmit)} className={props.className}>
          {reflected.map(entry => (
            <RenderEntry form={form} entry={entry} key={jKey(entry.path)} />
          ))}
          <Button type="submit">Submit</Button>
        </form>
      </Form>
      {Object.keys(form.formState.errors).length > 0 && (
        <pre>
          {JSON.stringify(
            {
              stae: form.formState,
              errors: form.formState.errors,
              data: form.getValues(),
            },
            null,
            2,
          )}
        </pre>
      )}
    </>
  )
}

const getInnerType = (schema: z.ZodType) => {
  const _schema = schema as any
  if (_schema.unwrap) {
    return {
      mod: {
        original: _schema,
        type: '.unwrap()',
      },
      schema: _schema.unwrap(),
    } as const
  }
  if (_schema._def.schema) {
    return {
      mod: {
        original: _schema,
        type: '_def.schema',
      },
      schema: _schema._def.schema,
    } as const
  }
  if (_schema._def.innerType) {
    return {
      mod: {
        original: _schema,
        type: '._def.innerType',
      },
      schema: _schema._def.innerType,
    } as const
  }

  return undefined
}

type Mod = NonNullable<ReturnType<typeof getInnerType>>['mod']

const deepInnerType = (schema: z.ZodType) => {
  let _schema = schema
  let next: ReturnType<typeof getInnerType>
  const mods: Mod[] = []
  // eslint-disable-next-line  no-cond-assign
  while ((next = getInnerType(_schema))) {
    _schema = next.schema
    mods.push(next.mod)
  }

  return {schema: _schema, mods}
}

// type Entry = {path: string[]; type: Typeof; values?: unknown[]; mods: Mod[]}
type Entry = {
  path: string[]
  schema: z.ZodType
  innerScheam: z.ZodType
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown'
  children?: Entry[] // for objects
  items?: Entry // for arrays
  entries?: Entry // for maps
  values?: unknown[]
  mods: Mod[]
}
export const zreflect = (input: z.ZodType, path: string[] = []): Array<Entry> => {
  const {schema, mods} = deepInnerType(input)

  const base = {path, mods, schema: input, innerScheam: schema} as const

  if (schema instanceof z.ZodString) {
    return [{...base, type: 'string'}]
  }
  if (schema instanceof z.ZodNumber) {
    return [{...base, type: 'number'}]
  }
  if (schema instanceof z.ZodBoolean) {
    return [{...base, type: 'boolean'}]
  }
  if (schema instanceof z.ZodEnum) {
    return [{...base, type: 'string', values: schema.options}] as const
  }
  if (schema instanceof z.ZodArray) {
    return [
      {
        ...base,
        type: 'array',
        items: zreflect(schema._def.type as never, [...path, '*number'])[0],
      },
    ] as const
  }

  if (schema instanceof z.ZodRecord) {
    return [
      {
        ...base,
        type: 'object',
        entries: zreflect(schema._def.valueType as never, [...path, '*string'])[0],
      },
    ]
  }

  if (schema instanceof z.ZodObject) {
    if (mods.length > 0) {
      throw new Error(`mods not supported on objects: ${JSON.stringify(mods)}`)
    }

    const entries = Object.entries<z.ZodType>(schema.shape as {})
    return [
      {
        ...base,
        type: 'object',
        children: entries.flatMap(([key, value]) => zreflect(value, [...path, key])),
      },
    ]
  }

  return [{...base, type: 'unknown'}]
}

const jKey = (array: unknown[]) => JSON.stringify(array)

const RenderEntryArray: typeof RenderEntry = ({form, entry}) => {
  const name = entry.path.join('.')

  if (entry.type !== 'array') throw 404

  const {fields, append, remove} = useFieldArray({
    control: form.control,
    name,
  })

  return (
    <ol data-entry-type="array">
      {fields.map((field, index) => (
        <li key={field.id}>
          <RenderEntry
            form={form}
            entry={{
              ...entry.items!,
              path: [...entry.items!.path.slice(0, -1), index.toString()],
              children: entry.items!.children?.map(child => ({
                ...child,
                path: [...child.path.slice(0, -2), index.toString(), ...child.path.slice(-1)],
              })),
            }}
          />
          <Button onClick={() => remove(index)}>
            Remove {name}.{index}
          </Button>
        </li>
      ))}
      <Button onClick={() => append(undefined)}>Add {name}</Button>
    </ol>
  )
}

const RenderEntryRecord: typeof RenderEntry = ({form, entry}) => {
  const name = entry.path.join('.')

  const [fields, setFields] = React.useState<{id: string; value: unknown}[]>([])

  React.useEffect(() => {
    form.setValue(name, Object.fromEntries(fields.map(f => [f.id, f.value])))
  }, [])

  return (
    <ul className="border-solid border-2 border-sky-500" data-entry-type="record" data-key={jKey(entry.path)}>
      {fields.map(field => (
        <li key={field.id}>
          <div>
            <i>{field.id}</i>
          </div>
          <RenderEntry
            form={form}
            entry={{
              ...entry.entries!,
              path: [...entry.entries!.path.slice(0, -1), field.id],
              children: entry.entries!.children?.map(child => ({
                ...child,
                path: [...child.path.slice(0, -2), field.id, ...child.path.slice(-1)],
              })),
            }}
          />
          <Button
            onClick={() => {
              setFields(old => old.filter(o => o.id !== field.id))
              form.setValue(
                name,
                pickBy(form.getValues(name), (_, k) => k !== field.id),
              )
            }}
          >
            Remove {field.id}
          </Button>
        </li>
      ))}
      <Button
        onClick={() => {
          const newId = prompt('Enter a key')
          if (!newId) return
          if (fields.some(f => f.id === newId)) {
            alert('Key already exists')
            return
          }
          setFields(old => [...old, {id: newId, value: undefined}])
        }}
      >
        Add {name}
      </Button>
    </ul>
  )
}

function pickBy<T extends {}>(obj: T, predicate: (value: T[keyof T], key: keyof T) => boolean): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => {
      return predicate(value as never, key as never)
    }),
  ) as never
}

const RenderEntry = ({form, entry}: {form: ReturnType<typeof useForm>; entry: Entry}) => {
  const key = jKey(entry.path)
  const label = entry.path.join('.')
  const name = entry.path.join('.')
  const description = entry.schema._fieldConfig?.description // && entry.path.join(' > ')
  if (entry.children) {
    return (
      <div data-entry-type="object" className="p-2 m-2 border-cyan-600" data-path={JSON.stringify(entry.path)}>
        {entry.children.map(child => (
          <RenderEntry form={form} entry={child} key={jKey(child.path)} />
        ))}
      </div>
    )
  }

  if (entry.type === 'array') {
    return <RenderEntryArray form={form} entry={entry} />
  }

  if (entry.type === 'object' && entry.entries) {
    return <RenderEntryRecord form={form} entry={entry} />
  }

  if (entry.type === 'string') {
    return (
      <FormField
        control={form.control}
        name={name as never}
        key={key}
        render={({field}) => (
          <FormItem data-key={key}>
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

  if (entry.type === 'number') {
    return (
      <FormField
        control={form.control}
        name={name as never}
        key={key}
        render={({field}) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Input type="number" {...field} onChange={v => field.onChange(v.target.valueAsNumber)} />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  if (entry.type === 'boolean') {
    return (
      <FormField
        control={form.control}
        name={name as never}
        key={key}
        render={({field}) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={checked => field.onChange(checked)} />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return <>dunno</>
}
