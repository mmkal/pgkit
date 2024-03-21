import * as pgAst from 'pgsql-ast-parser'
import {expect, test} from 'vitest'

expect.addSnapshotSerializer({
  test: Boolean,
  print: val => JSON.stringify(val, null, 2),
})

test('ast parser', async () => {
  const query = `
    with foo as (
      select product_no, name, price from products
    ),
    bar as (
      select product_no, order_id from orders
    )
    select * from bar
  `

  const ast = pgAst.parse(query, {locationTracking: true})

  expect(ast).toMatchInlineSnapshot(`
    [
      {
        "type": "with",
        "bind": [
          {
            "alias": {
              "name": "foo",
              "_location": {
                "start": 10,
                "end": 13
              }
            },
            "statement": {
              "columns": [
                {
                  "expr": {
                    "type": "ref",
                    "name": "product_no",
                    "_location": {
                      "start": 32,
                      "end": 42
                    }
                  },
                  "_location": {
                    "start": 32,
                    "end": 42
                  }
                },
                {
                  "expr": {
                    "type": "ref",
                    "name": "name",
                    "_location": {
                      "start": 44,
                      "end": 48
                    }
                  },
                  "_location": {
                    "start": 44,
                    "end": 48
                  }
                },
                {
                  "expr": {
                    "type": "ref",
                    "name": "price",
                    "_location": {
                      "start": 50,
                      "end": 55
                    }
                  },
                  "_location": {
                    "start": 50,
                    "end": 55
                  }
                }
              ],
              "_location": {
                "start": 25,
                "end": 69
              },
              "from": [
                {
                  "type": "table",
                  "name": {
                    "name": "products",
                    "_location": {
                      "start": 61,
                      "end": 69
                    }
                  },
                  "_location": {
                    "start": 61,
                    "end": 69
                  }
                }
              ],
              "type": "select"
            },
            "_location": {
              "start": 10,
              "end": 75
            }
          },
          {
            "alias": {
              "name": "bar",
              "_location": {
                "start": 81,
                "end": 84
              }
            },
            "statement": {
              "columns": [
                {
                  "expr": {
                    "type": "ref",
                    "name": "product_no",
                    "_location": {
                      "start": 103,
                      "end": 113
                    }
                  },
                  "_location": {
                    "start": 103,
                    "end": 113
                  }
                },
                {
                  "expr": {
                    "type": "ref",
                    "name": "order_id",
                    "_location": {
                      "start": 115,
                      "end": 123
                    }
                  },
                  "_location": {
                    "start": 115,
                    "end": 123
                  }
                }
              ],
              "_location": {
                "start": 96,
                "end": 135
              },
              "from": [
                {
                  "type": "table",
                  "name": {
                    "name": "orders",
                    "_location": {
                      "start": 129,
                      "end": 135
                    }
                  },
                  "_location": {
                    "start": 129,
                    "end": 135
                  }
                }
              ],
              "type": "select"
            },
            "_location": {
              "start": 81,
              "end": 141
            }
          }
        ],
        "in": {
          "columns": [
            {
              "expr": {
                "type": "ref",
                "name": "*",
                "_location": {
                  "start": 153,
                  "end": 154
                }
              },
              "_location": {
                "start": 153,
                "end": 154
              }
            }
          ],
          "_location": {
            "start": 146,
            "end": 163
          },
          "from": [
            {
              "type": "table",
              "name": {
                "name": "bar",
                "_location": {
                  "start": 160,
                  "end": 163
                }
              },
              "_location": {
                "start": 160,
                "end": 163
              }
            }
          ],
          "type": "select"
        },
        "_location": {
          "start": 5,
          "end": 163
        }
      }
    ]
  `)
})
