export type Bar_Type = Bar_0["fields"];

export type Bar = {
  [K in keyof Bar_Type]: Bar_Type[K];
};

export interface Bar_0 {
  query: "select '{}'::jsonb";
  file: "src/index.ts";
  fields: {
    /** PostgreSQL type: jsonb */
    jsonb: any /* jsonb */;
  };
}
