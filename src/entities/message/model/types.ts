export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received'

export interface ChatMessage {
  id: string
  text: string
  timestamp: number
  direction: 'outgoing' | 'incoming'
  status: MessageStatus
  senderName?: string
}
