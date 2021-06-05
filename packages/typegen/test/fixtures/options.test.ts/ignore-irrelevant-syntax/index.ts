import {sql} from 'slonik'

export default () => {
  if (Math.random() > 0.5) {
    const otherTag: any = (val: any) => val
    return otherTag`foo`
  }
  if (Math.random() > 0.5) {
    const otherTag: any = {foo: (val: any) => val}
    return otherTag.foo`bar`
  }
  return sql<queries.Anonymous>`select 1`
}

export declare namespace queries {
  /** - query: `select 1` */
  export interface Anonymous {
    /** regtype: `integer` */
    '?column?': number | null
  }
}
