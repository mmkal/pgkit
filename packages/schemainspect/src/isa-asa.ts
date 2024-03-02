import {inspect} from 'util'

// eslint-disable-next-line mmkal/@typescript-eslint/no-extraneous-class
declare abstract class Constructible {
  constructor(..._: any[])
}

type Classy = typeof Constructible

type Instance<T extends Classy> = T extends typeof String
  ? string
  : T extends typeof Number
    ? number
    : T extends typeof Boolean
      ? boolean
      : InstanceType<T>

const typeofs = new Map([
  [String, 'string'],
  [Number, 'number'],
  [Boolean, 'boolean'],
] as Array<[Function, string]>)

const _isa: <T extends Classy>(value: unknown, clss: T, options?: {message?}) => asserts value is Instance<T> = (
  value,
  clss,
  {message = ''} = {},
) => {
  const suffix = () => `Value: ${inspect(value, {depth: 1})}. ${message}`.trim()
  if (clss === null) {
    if (value !== null) {
      throw new TypeError(`Expected null, got ${suffix()}`)
    }

    return
  }

  if (typeofs.has(clss)) {
    if (typeof value !== typeofs.get(clss)) {
      throw new TypeError(`Expected ${typeofs.get(clss)}, got ${typeof value}. ${suffix()}`)
    }

    return
  }

  if (typeof clss !== 'function') {
    throw new TypeError(`Expected class, got ${typeof clss}, ${suffix()}`)
  }

  if (!(value instanceof (clss as any))) {
    throw new TypeError(
      // eslint-disable-next-line mmkal/@typescript-eslint/restrict-template-expressions
      `Expected ${(clss as any).name}, got ${value?.constructor?.name || value}. ${suffix()}`,
    )
  }
}

const _isaRecord: <T extends Classy>(value: unknown, obj: T) => asserts value is Record<string, Instance<T>> = (
  value: unknown,
  obj: any,
) => {
  _isa(value, Object)
  // eslint-disable-next-line guard-for-in
  for (const key in value) {
    _isa((value as any)[key], obj, {message: `Key: ${key}`})
  }
}

const _isArray: <T extends Classy>(value: unknown, clss: T) => asserts value is Array<Instance<T>> = (value, clss) => {
  _isa(value, Array)
  for (const item of value) {
    _isa(item, clss)
  }
}

const _isAMatch: (value: unknown, regex: RegExp) => asserts value is string = (value, regex) => {
  _isa(value, String)
  if (!regex.test(value)) {
    throw new TypeError(`Expected ${regex}, got ${value}`)
  }
}

export const isa: typeof _isa & {record: typeof _isaRecord; array: typeof _isArray; match: typeof _isAMatch} =
  Object.assign(_isa, {
    record: _isaRecord,
    array: _isArray,
    match: _isAMatch,
  })

export const asa: <T extends Classy>(value: unknown, clss: T) => typeof value & Instance<T> = (value, clss) => {
  isa(value, clss)
  return value
}

export const looksa = <T extends Record<string, Classy>>(
  value: unknown,
  obj: T,
): asserts value is {[K in keyof T]: Instance<T[K]>} => {
  isa(value, Object)
  // eslint-disable-next-line guard-for-in
  for (const key in obj) {
    isa((value as any)[key], obj[key])
  }
}

export const hasa: <V, K extends string>(value: V, key: K) => asserts value is typeof value & {[k in K]: unknown} = (
  value,
  key,
) => {
  if (!value || typeof value !== 'object') {
    throw new Error(`Expected object, got ${value && typeof value}`)
  }

  if (!(key in value)) {
    throw new Error(`Expected key ${key}, got ${inspect(value)}`)
  }
}
