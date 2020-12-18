
  /**
   * - query: `select 'foo' as f, 'bar' as b`
   */
  export interface Q2 {
    
      /** postgres type: text */
      f: string & { _brand: "foo" }
    ,
      /** postgres type: text */
      b: string
    
}