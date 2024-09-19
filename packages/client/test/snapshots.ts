export function printPostgresErrorSnapshot(val: any): string {
  return (
    `[${val.message}]\n`.replace('[undefined]\n', '') +
    JSON.stringify(
      val,
      function (key, value) {
        if (value?.code) {
          return {message: value.message, code: value.code, query: value.query}
        }
        if (key === 'dataTypeID' || key === 'tableID') {
          return 123_456_789 // avoid unstable pg generated ids
        }
        if (this.name === 'error' && key === 'line') {
          return '123456789' // avoid unstable line numbers of generated statements
        }

        if (value?.toJSON) {
          return value.toJSON()
        }

        return value
      },
      2,
    )
  )
}
