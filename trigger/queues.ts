import { queue } from '@trigger.dev/sdk'

export const CVC_QUEUE_CONFIG = [
  { name: 'cvc-ai', concurrencyLimit: 2 },
  { name: 'cvc-render', concurrencyLimit: 1 },
  { name: 'cvc-media', concurrencyLimit: 2 },
  { name: 'cvc-compose', concurrencyLimit: 1 },
] as const

export const aiQueue = queue(CVC_QUEUE_CONFIG[0])
export const renderQueue = queue(CVC_QUEUE_CONFIG[1])
export const mediaQueue = queue(CVC_QUEUE_CONFIG[2])
export const composeQueue = queue(CVC_QUEUE_CONFIG[3])

export type CvcQueueName = (typeof CVC_QUEUE_CONFIG)[number]['name']
