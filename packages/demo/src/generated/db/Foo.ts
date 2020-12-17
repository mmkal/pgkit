export type Foo_Type = Foo_0["fields"];

export type Foo = {
  [K in keyof Foo_Type]: Foo_Type[K];
};

export interface Foo_0 {
  query: "select '{}'::json";
  file: "src/index.ts";
  fields: {
    /** PostgreSQL type: json */
    json: any /* json */;
  };
}
