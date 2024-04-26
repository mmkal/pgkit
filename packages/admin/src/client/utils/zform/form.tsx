/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-misused-promises */

import './augment-prototype'

import {zodResolver} from '@hookform/resolvers/zod'
import React from 'react'
import {
  ControllerProps,
  FieldPath,
  FieldValues,
  UseFormProps,
  useFieldArray,
  useForm,
  useFormState,
} from 'react-hook-form'
import {b} from 'vitest/dist/suite-ghspeorC.js'
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

export interface ZFormProps<Z extends z.ZodObject<any>> {
  schema: Z
  onSubmit?: (values: z.infer<Z>) => void
  onTouch?: (values: z.infer<Z>) => void
  className?: string
  config?: FieldConfigs<z.infer<Z>>
  useFormProps?: UseFormProps<z.infer<Z>>
}

const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  {key = JSON.stringify as (args: Parameters<T>) => string, maxSize = 100} = {},
) => {
  const cache = new Map<string, ReturnType<T>>()
  return (...args: Parameters<T>): ReturnType<T> => {
    const k = key(args)
    if (cache.has(k)) {
      return cache.get(k) as ReturnType<T>
    }

    const result = fn(...args)
    if (cache.size > maxSize) {
      for (const old of [...cache.keys()].slice(-maxSize / 2)) {
        cache.delete(old)
      }
    }
    cache.set(k, result as never)
    return result
  }
}

export function ZForm<Z extends z.ZodObject<any>>({useFormProps, ...props}: ZFormProps<Z>) {
  const form = useForm<z.infer<typeof props.schema>>({
    resolver: zodResolver(props.schema),
    ...useFormProps,
  })
  const reflected = React.useMemo(() => zreflect(props.schema), [props.schema])

  const onValid = React.useMemo(() => {
    return (
      props.onTouch &&
      memoize(props.onTouch, {
        // todo: figure out why so many cache misses
        key: ([value]) => JSON.stringify(value, null, 2),
        maxSize: 1,
      })
    )
  }, [props.onTouch])

  if (onValid) {
    form.watch(() => {
      onValid(form.getValues())
    })
  }
  // React.useEffect(() => {
  //   if (form.formState.isValid) {
  //     onValid?.(form.getValues())
  //   }
  // }, [onValid, form.formState, form.getValues()])

  // React.useEffect(() => {
  //   if (currentValue && form.formState.isValid) {
  //     props.onValid?.(currentValue)
  //   }
  // }, [props.onValid, form.formState.isValid, currentValue])

  return (
    <>
      <Form {...form}>
        <form onSubmit={props.onSubmit && form.handleSubmit(props.onSubmit)} className={props.className}>
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

const RenderEntryArray = ({form, entry}: RenderEntryProps) => {
  const name = entry.path.join('.')

  if (entry.type !== 'array') throw 404

  const {fields, append, remove} = useFieldArray({
    control: form.control,
    name,
  })

  React.useEffect(() => {
    if (entry.schema._fieldConfig?.defaultValue) {
      form.setValue(name, entry.schema._fieldConfig?.defaultValue)
    }
  }, [entry.schema._fieldConfig?.defaultValue])

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
      <Button onClick={() => append(undefined)}>Add to {name}</Button>
    </ol>
  )
}

const RenderEntryRecord = ({form, entry}: RenderEntryProps) => {
  const name = entry.path.join('.')
  const config = entry.schema._fieldConfig
  if (config?.Renderer) {
    throw new Error(`Cannot use both Renderer on a record field: ${name}`)
  }

  const Wrapper = config?.Wrapper || NoopWrapper

  // todo: stop using Object.fromEntries, it means we have to keep `fields` and `setValue` in sync
  const [fields, setFields] = React.useState<{id: string; value: unknown}[]>(() => {
    return entry.schema._fieldConfig?.defaultValue
      ? Object.entries(entry.schema._fieldConfig?.defaultValue as {}).map(e => ({
          id: e[0],
          value: e[1],
        }))
      : []
  })

  React.useEffect(() => {
    form.setValue(name, Object.fromEntries(fields.map(f => [f.id, f.value])))
  }, [])

  // todo: should `Wrapper` replace `<ul>` or wrap it?
  return (
    <Wrapper>
      <ul className={entry.schema._fieldConfig?.className} data-entry-type="record" data-key={jKey(entry.path)}>
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
          Add to {name}
        </Button>
      </ul>
    </Wrapper>
  )
}

function pickBy<T extends {}>(obj: T, predicate: (value: T[keyof T], key: keyof T) => boolean): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => {
      return predicate(value as never, key as never)
    }),
  ) as never
}

/** `React.Fragment` warns you against passing additional props. This just ignores them */
const NoopWrapper = ({children}: React.ComponentProps<typeof React.Fragment>) => (
  <React.Fragment>{children}</React.Fragment>
)

type RenderEntryProps = {
  form: ReturnType<typeof useForm>
  entry: Entry
}

const RenderEntry = ({form, entry}: RenderEntryProps) => {
  const key = jKey(entry.path)
  const name = entry.path.join('.')
  const config = entry.schema._fieldConfig
  const label = config?.label ?? entry.path.join('.')
  const description = config?.description

  if (config?.Renderer && config?.Wrapper) {
    throw new Error(`Cannot use both Renderer and Wrapper on the same field: ${key}`)
  }

  const Renderer = config?.Renderer || NoopWrapper
  const Wrapper = config?.Wrapper || NoopWrapper

  if (entry.children) {
    return (
      <Wrapper>
        <div data-entry-type="object" data-path={JSON.stringify(entry.path)}>
          {entry.children.map(child => (
            <RenderEntry form={form} entry={child} key={jKey(child.path)} />
          ))}
        </div>
      </Wrapper>
    )
  }

  if (entry.type === 'array') {
    return (
      <Wrapper>
        <RenderEntryArray form={form} entry={entry} />
      </Wrapper>
    )
  }

  if (entry.type === 'object' && entry.entries) {
    return (
      <Wrapper>
        <RenderEntryRecord form={form} entry={entry} />
      </Wrapper>
    )
  }

  if (entry.type === 'string') {
    return (
      <FormField
        control={form.control}
        name={name as never}
        key={key}
        defaultValue={config?.defaultValue as never}
        render={props => (
          <Renderer {...props} key={key}>
            <FormItem data-key={key}>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input {...config?.input} {...props.field} />
              </FormControl>
              {description && <FormDescription>{description}</FormDescription>}
              <FormMessage />
            </FormItem>
          </Renderer>
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
        defaultValue={config?.defaultValue as never}
        render={props => (
          <Renderer {...props} key={key}>
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...config?.input}
                  {...props.field}
                  onChange={v => props.field.onChange(v.target.valueAsNumber)}
                />
              </FormControl>
              {description && <FormDescription>{description}</FormDescription>}
              <FormMessage />
            </FormItem>
          </Renderer>
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
        defaultValue={Boolean(config?.defaultValue ?? false) as never}
        render={props => (
          <Renderer {...props} key={key}>
            <FormItem>
              <div className="inline-flex gap-2">
                <FormControl>
                  <Checkbox checked={props.field.value} onCheckedChange={checked => props.field.onChange(checked)} />
                </FormControl>
                <FormLabel>{label}</FormLabel>
              </div>
              {description && <FormDescription>{description}</FormDescription>}
              <FormMessage />
            </FormItem>
          </Renderer>
        )}
      />
    )
  }

  return <>dunno</>
}
