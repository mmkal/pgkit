type Dict<T> = Record<string, T>

// deviation from python: add_dependencies_for_modifications = true removed - not used
export function differences<T extends {equals: (other: T) => boolean}>(a: Dict<T>, b: Dict<T>) {
  const a_keys = new Set(Object.keys(a))
  const b_keys = new Set(Object.keys(b))
  const keys_added = new Set([...b_keys].filter(x => !a_keys.has(x)))
  const keys_removed = new Set([...a_keys].filter(x => !b_keys.has(x)))
  const keys_common = new Set([...a_keys].filter(x => b_keys.has(x)))

  // deviation: python overloaded the == operator, but can't do that in js, so this function is restricted to objects with an `equals` method
  // also, creating intermediate sets of keys_unmodified and keys_modified - python iterates and checks equality twice.
  const keys_unmodified = new Set([...keys_common].filter(key => a[key].equals(b[key])))
  const keys_modified = new Set([...keys_common].filter(key => !keys_unmodified.has(key)))

  const added = sortKeys(Object.fromEntries([...keys_added].map(key => [key, b[key]])))
  const removed = sortKeys(Object.fromEntries([...keys_removed].map(key => [key, a[key]])))
  const modified = sortKeys(Object.fromEntries([...keys_modified].map(key => [key, b[key]])))
  const unmodified = sortKeys(Object.fromEntries([...keys_unmodified].map(key => [key, b[key]])))

  return {added, removed, modified, unmodified, array: [added, removed, modified, unmodified]}
}

export const sortKeys = <T extends Record<string, any>>(obj: T) => {
  // replicating a kinda bug from python: they use `sorted(...)` which just does a < b, which is not the same as localeCompare
  return Object.fromEntries(Object.entries(obj).sort()) as T
  // IMO it should really be this:
  // return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T
}

export const groupBy = <T>(arr: T[], fn: (item: T) => string): Record<string, T[]> => {
  return arr.reduce<Record<string, T[]>>((acc, value) => {
    const group = fn(value)
    acc[group] ||= []
    acc[group].push(value)
    return acc
  }, {})
}

export const isEqual = (a: unknown, b: unknown) => {
  const replacer = (key: string, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return sortKeys(value)
    }

    return value
  }

  return JSON.stringify(a, replacer) === JSON.stringify(b, replacer)
}

export const maxBy = <T>(list: T[], fn: (x: T) => number) => {
  const result = list.reduce<{item: T; value: number} | null>((max, item) => {
    const value = fn(item)
    return !max || value > max.value ? {item, value} : max
  }, null)
  return result?.item
}
