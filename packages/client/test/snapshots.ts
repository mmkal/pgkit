export function printPostgresErrorSnapshot(val: any): string {
  return (
    `[${val.message}]\n`.replace('[undefined]\n', '') +
    JSON.stringify(
      val,
      function (key, value) {
        if (key === 'dataTypeID' || key === 'tableID') {
          return 123_456_789 // avoid unstable pg generated ids
        }
        if (this.name === 'error' && key === 'line') {
          return '123456789' // avoid unstable line numbers of generated statements
        }

        return value
      },
      2,
    )
  )
}
