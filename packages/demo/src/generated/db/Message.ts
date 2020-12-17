export type Message_Type = Message_0["fields"];

export type Message = {
  [K in keyof Message_Type]: Message_Type[K];
};

export interface Message_0 {
  query: "select * from messages\r\n where id < $1\r\n order by created_at desc\r\n limit 10";
  file: "src/index.ts";
  fields: {
    /** PostgreSQL type: integer */
    id: number;
    /** PostgreSQL type: character varying(20) */
    content: string;
    /** PostgreSQL type: timestamp with time zone */
    created_at: number;
    /** PostgreSQL type: message_priority */
    priority: high | low | medium;
  };
}
