import * as slonik from "slonik";

import { MessageId } from "./MessageId";
import { Message } from "./Message";
import { Foo } from "./Foo";
import { Bar } from "./Bar";

export interface GenericSqlTaggedTemplateType<T> {
  <U = T>(
    template: TemplateStringsArray,
    ...vals: slonik.ValueExpressionType[]
  ): slonik.TaggedTemplateLiteralInvocationType<U>;
}

export type SqlType = typeof slonik.sql & {
  MessageId: GenericSqlTaggedTemplateType<MessageId>;
  Message: GenericSqlTaggedTemplateType<Message>;
  Foo: GenericSqlTaggedTemplateType<Foo>;
  Bar: GenericSqlTaggedTemplateType<Bar>;
};

export const sql: SqlType = Object.assign(
  (...args: Parameters<typeof slonik.sql>): ReturnType<typeof slonik.sql> =>
    slonik.sql(...args),
  slonik.sql,
  {
    MessageId: slonik.sql,
    Message: slonik.sql,
    Foo: slonik.sql,
    Bar: slonik.sql,
  }
);
