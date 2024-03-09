import {Transactable} from '@pgkit/client'

export interface ServerContext {
  connection: Transactable
}
