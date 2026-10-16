export type Page = 'dashboard' | 'items' | 'transactions' | 'history' | 'reports'
export type TransactionType = 'in' | 'out'
export interface Item { id: string; code: string; name: string; category: string; unit: string; opening_stock: number; current_stock: number; minimum_stock: number; description?: string }
export interface Transaction { id: string; transaction_date: string; type: TransactionType; item_id: string; quantity: number; balance_after: number; recipient?: string; department?: string; purpose?: string; source?: string; officer_name: string; initials?: string; notes?: string; item?: Pick<Item, 'code' | 'name' | 'unit'> }
