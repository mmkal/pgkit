import {z} from 'zod'

z.ZodType.prototype.field = function (this, config) {
  this._fieldConfig = config
  return this
}
