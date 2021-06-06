export default sql<queries.A_a>`select 1 as a, 'two' as a`

export declare namespace queries {
  /** - query: `select 1 as a, 'two' as a` */
  export interface A_a {
    /**
     * Warning: 2 columns detected for field a!
     *
     * regtype: `integer`
     *
     * regtype: `text`
     */
    a: (number | null) | (string | null)
  }
}
