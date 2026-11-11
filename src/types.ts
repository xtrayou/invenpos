export type Page = 'dashboard' | 'items' | 'transactions' | 'history' | 'reports'
export type TransactionType = 'in' | 'out'

export interface Item {
  id: string
  code: string
  name: string
  category: string
  unit: string
  opening_stock: number
  current_stock: number
  minimum_stock: number
  description?: string
}

export interface Transaction {
  id: string
  transaction_date: string
  type: TransactionType
  item_id: string
  quantity: number
  balance_after: number
  recipient?: string
  department?: string
  purpose?: string
  source?: string
  officer_name: string
  initials?: string
  notes?: string
  created_at?: string
  item?: Pick<Item, 'code' | 'name' | 'unit'>
}

export interface DraftTransactionItem {
  tempId: string
  itemId: string
  item: Item
  quantity: number
  notes?: string
}

export interface TransactionGroup {
  groupId: string
  date: string
  type: TransactionType
  recipient: string
  initials: string
  officer_name: string
  createdAt: string
  items: Transaction[]
}
