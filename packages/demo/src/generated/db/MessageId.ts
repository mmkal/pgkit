export type MessageId_Type = MessageId_0["fields"];

export type MessageId = {
  [K in keyof MessageId_Type]: MessageId_Type[K];
};

export interface MessageId_0 {
  query: "insert into messages(content)\r\n values ($1)\r\n returning id";
  file: "src/index.ts";
  fields: {
    /** PostgreSQL type: integer */
    id: number;
  };
}
