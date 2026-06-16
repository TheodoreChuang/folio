import { createGateway } from 'ai'
import { env } from '@/lib/env'

const gateway = createGateway()

export function getModel() {
  return gateway(env.ASSISTANT_MODEL)
}
