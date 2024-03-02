// look at: https://github.com/microsoft/TypeScript/issues/40451 - potential alternatives?
// also https://github.com/microsoft/TypeScript/issues/26792
export function AutoThisAssigner<T>(): new (params: T) => T
export function AutoThisAssigner<T, X extends new (...args: any[]) => any>(
  C: X,
): new (params: T, ...args: ConstructorParameters<X>) => T & InstanceType<X>
export function AutoThisAssigner<T, X extends abstract new (...args: any[]) => any>(
  C: X,
): new (params: T, ...args: ConstructorParameters<X>) => T & InstanceType<X>
export function AutoThisAssigner(C: any = Object) {
  return class extends C {
    constructor(params: any, ...args: any[]) {
      super(...args)
      Object.assign(this, params)
    }
  }
}

export type SomeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type SomeRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>
