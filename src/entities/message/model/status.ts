import type { MessageStatus } from './types'

const statusRanks: Partial<Record<MessageStatus, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

export function normalizeOutgoingStatus(status: string): MessageStatus | null {
  if (status === 'pending') {
    return 'queued'
  }
  if (status === 'notInGroup' || status === 'noAccount') {
    return 'failed'
  }
  if (status === 'sent' || status === 'delivered' || status === 'read' || status === 'failed') {
    return status
  }
  return null
}

export function advanceOutgoingStatus(current: MessageStatus, next: MessageStatus): MessageStatus {
  if (current === 'received' || current === 'failed' || current === 'read') {
    return current
  }
  if (next === 'failed') {
    return 'failed'
  }
  const currentRank = statusRanks[current] ?? -1
  const nextRank = statusRanks[next] ?? -1
  return nextRank > currentRank ? next : current
}
