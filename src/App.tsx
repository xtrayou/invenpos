import { useEffect, useRef, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type { DraftTransactionItem, Item, Page, Transaction, TransactionGroup, TransactionType } from './types'
import {
  AlertCircle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Minus,
  Moon,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Sun,
  Table as TableIcon,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import * as XLSX from 'xlsx'
import logo from './logo.png'

const SESSION_DURATION_MS = 30 * 60 * 1000
const SESSION_STARTED_AT_KEY = 'atk-session-started-at'
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'items', label: 'Data Barang', icon: Boxes },
  { id: 'transactions', label: 'Transaksi Stok', icon: ArrowDownToLine },
  { id: 'history', label: 'Riwayat Transaksi', icon: Archive },
  { id: 'reports', label: 'Laporan Excel', icon: FileSpreadsheet },
]

const formatNumber = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0)

const formatDisplayDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

const formatDate = (s: string) => formatDisplayDate(s)

const localDateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input type="date" lang="id-ID" value={value} onChange={e => onChange(e.target.value)} />
}

function groupTransactions(transactions: Transaction[]): TransactionGroup[] {
  const groups: TransactionGroup[] = []
  const groupMap = new Map<string, TransactionGroup>()

  transactions.forEach(tx => {
    const dateKey = tx.transaction_date || ''
    const typeKey = tx.type
    const recipientKey = (tx.recipient || tx.source || '').trim()
    const initialsKey = (tx.initials || '').trim()
    const timeKey = tx.created_at ? tx.created_at.slice(0, 16) : dateKey
    const key = `${dateKey}_${typeKey}_${recipientKey}_${initialsKey}_${timeKey}`

    let group = groupMap.get(key)
    if (!group) {
      group = {
        groupId: key,
        date: tx.transaction_date,
        type: tx.type,
        recipient: tx.recipient || tx.source || '-',
        initials: tx.initials || '-',
        officer_name: tx.officer_name,
        createdAt: tx.created_at || '',
        items: []
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    group.items.push(tx)
  })

  return groups
}

// Toast Notification Interface
interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  title: string
  message?: string
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto p-4 rounded-xl shadow-lg border flex items-start gap-3 transition-all duration-200 transform translate-y-0 ${
            t.type === 'success'
              ? 'bg-white border-teal-200 text-teal-900 shadow-teal-500/10'
              : t.type === 'error'
              ? 'bg-white border-red-200 text-red-900 shadow-red-500/10'
              : 'bg-white border-blue-200 text-blue-900 shadow-blue-500/10'
          }`}
        >
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              t.type === 'success'
                ? 'bg-teal-100 text-teal-600'
                : t.type === 'error'
                ? 'bg-red-100 text-red-600'
                : 'bg-blue-100 text-blue-600'
            }`}
          >
            {t.type === 'success' ? <CheckCircle2 size={18} /> : t.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-slate-800">{t.title}</p>
            {t.message && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}

const fetchAllTransactions = async () => {
  const pageSize = 1000
  const allTransactions: Transaction[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('stock_transactions')
      .select('*, item:items(code,name,unit)')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    allTransactions.push(...(data as Transaction[]))
    if (data.length < pageSize) return allTransactions
    offset += pageSize
  }
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [items, setItems] = useState<Item[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionItemId, setTransactionItemId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebar, setSidebar] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('atk-theme') === 'dark')

  // --- Draft state diangkat ke App agar tidak hilang saat navigasi (persistent draft) ---
  const [txDraftHeaderIn, setTxDraftHeaderIn] = useState({
    transaction_date: localDateString(new Date()),
    recipient: '',
    initials: ''
  })
  const [txDraftItemsIn, setTxDraftItemsIn] = useState<DraftTransactionItem[]>([])
  const [txDraftHeaderOut, setTxDraftHeaderOut] = useState({
    transaction_date: localDateString(new Date()),
    recipient: '',
    initials: ''
  })
  const [txDraftItemsOut, setTxDraftItemsOut] = useState<DraftTransactionItem[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('atk-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      document.head.appendChild(favicon)
    }
    favicon.href = logo
    document.title = 'INVENTARIS REKAP — KCU KARAWANG'
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let mounted = true
    const signOutExpiredSession = () => {
      localStorage.removeItem(SESSION_STARTED_AT_KEY)
      if (mounted) setSession(null)
      void supabase.auth.signOut()
    }
    supabase.auth.getSession().then(({ data }) => {
      const startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY))
      const expired = !data.session || !startedAt || Date.now() - startedAt >= SESSION_DURATION_MS
      if (data.session && expired) signOutExpiredSession()
      else if (mounted) setSession(data.session)
      if (mounted) setLoading(false)
    }).catch(error => {
      console.error('Gagal memeriksa sesi login', error)
      if (mounted) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, current) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_IN') localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()))
      if (event === 'SIGNED_OUT') localStorage.removeItem(SESSION_STARTED_AT_KEY)
      if (mounted) setSession(current)
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY))
    const remaining = startedAt ? SESSION_DURATION_MS - (Date.now() - startedAt) : 0
    if (remaining <= 0) {
      localStorage.removeItem(SESSION_STARTED_AT_KEY)
      setSession(null)
      void supabase.auth.signOut()
      return
    }
    const timeout = window.setTimeout(() => {
      localStorage.removeItem(SESSION_STARTED_AT_KEY)
      setSession(null)
      void supabase.auth.signOut()
    }, remaining)
    return () => window.clearTimeout(timeout)
  }, [session])

  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('items').select('*').order('name'),
      fetchAllTransactions(),
    ]).then(([itemResult, transactionResult]) => {
      if (!itemResult.error && itemResult.data) setItems(itemResult.data)
      setTransactions(transactionResult)
      setLoading(false)
    }).catch(error => {
      console.error('Gagal memuat data inventaris', error)
      setLoading(false)
    })
  }, [session])

  const handleDeleteTransaction = async (tx: Transaction) => {
    const item = items.find(i => i.id === tx.item_id)
    if (!item) return alert('Barang terkait tidak ditemukan.')

    const newStock = tx.type === 'in' ? item.current_stock - tx.quantity : item.current_stock + tx.quantity
    if (newStock < 0) {
      return alert(
        `Tidak dapat membatalkan transaksi ini karena stok saat ini (${item.current_stock} ${item.unit}) kurang dari jumlah transaksi yang dibatalkan (${tx.quantity} ${item.unit}).`
      )
    }

    if (
      !window.confirm(
        `Hapus transaksi "${item.name}" (${tx.type === 'in' ? 'Masuk' : 'Keluar'} ${tx.quantity} ${item.unit})? Stok barang akan disesuaikan kembali.`
      )
    ) {
      return
    }

    const { error: rpcError } = await supabase.rpc('delete_stock_transaction', { p_transaction_id: tx.id })
    if (rpcError) {
      const { error: updateError } = await supabase.from('items').update({ current_stock: newStock }).eq('id', item.id)
      if (updateError) return alert('Gagal memperbarui stok: ' + updateError.message)
      const { error: deleteError } = await supabase.from('stock_transactions').delete().eq('id', tx.id)
      if (deleteError) return alert('Gagal menghapus transaksi: ' + deleteError.message)
    }

    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, current_stock: newStock } : i)))
    setTransactions(prev => prev.filter(t => t.id !== tx.id))
    alert('Transaksi berhasil dihapus dan stok barang telah disesuaikan kembali.')
  }

  if (!isSupabaseConfigured) return <Login configurationError />
  if (!session) return <Login />
  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">Memuat data inventaris...</div>

  const logout = () => {
    localStorage.removeItem(SESSION_STARTED_AT_KEY)
    void supabase.auth.signOut()
  }

  return (
    <div className="app-shell min-h-screen text-slate-800">
      <Sidebar page={page} setPage={setPage} open={sidebar} close={() => setSidebar(false)} onLogout={logout} draftCount={txDraftItemsIn.length + txDraftItemsOut.length} />
      <main className="lg:pl-64">
        <header className="app-header h-16 border-b px-5 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <button className="lg:hidden p-2 rounded-lg hover:bg-slate-100" onClick={() => setSidebar(true)}>
            <Menu size={22} />
          </button>
          <div className="hidden lg:block">
            <p className="text-sm text-slate-400">{formatDisplayDate(new Date())}</p>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button className="theme-toggle" aria-label="Ubah tema" onClick={() => setDarkMode(v => !v)}>
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">Admin Inventaris</p>
              <p className="text-xs text-slate-400">Administrator</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-teal-100 text-teal-700 grid place-items-center">
              <UserRound size={17} />
            </div>
          </div>
        </header>

        <div className="p-5 md:p-8 max-w-[1600px] mx-auto">
          {/* Banner draft aktif — tampil saat user di halaman lain tapi masih ada item di keranjang */}
          {page !== 'transactions' && (txDraftItemsIn.length + txDraftItemsOut.length) > 0 && (
            <div className="mb-5 flex items-center gap-3 p-3.5 pl-4 bg-amber-50 border border-amber-300 rounded-xl shadow-sm">
              <span className="h-8 w-8 rounded-full bg-amber-200 text-amber-900 grid place-items-center shrink-0 text-sm">
                🛒
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900">Ada draft transaksi yang belum disimpan</p>
                <p className="text-xs text-amber-700">
                  {txDraftItemsIn.length > 0 && `Barang Masuk: ${txDraftItemsIn.length} item`}
                  {txDraftItemsIn.length > 0 && txDraftItemsOut.length > 0 && ' • '}
                  {txDraftItemsOut.length > 0 && `Barang Keluar: ${txDraftItemsOut.length} item`}
                </p>
              </div>
              <button
                onClick={() => setPage('transactions')}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-amber-900 transition"
              >
                Lanjutkan →
              </button>
            </div>
          )}

          {page === 'dashboard' && (
            <Dashboard
              items={items}
              transactions={transactions}
              onOpenStockEntry={item => {
                setTransactionItemId(item.id)
                setPage('transactions')
              }}
            />
          )}
          {page === 'items' && <Items items={items} transactions={transactions} setItems={setItems} />}

          {/* TransactionsPage selalu ter-mount (tidak di-unmount saat pindah halaman)
              agar draft keranjang & form tidak hilang. Disembunyikan via CSS. */}
          <div style={{ display: page === 'transactions' ? undefined : 'none' }}>
            <TransactionsPage
              items={items}
              setItems={setItems}
              transactions={transactions}
              setTransactions={setTransactions}
              initialItemId={transactionItemId}
              onClearInitialItemId={() => setTransactionItemId(null)}
              onDeleteTransaction={handleDeleteTransaction}
              headerIn={txDraftHeaderIn}
              setHeaderIn={setTxDraftHeaderIn}
              draftIn={txDraftItemsIn}
              setDraftIn={setTxDraftItemsIn}
              headerOut={txDraftHeaderOut}
              setHeaderOut={setTxDraftHeaderOut}
              draftOut={txDraftItemsOut}
              setDraftOut={setTxDraftItemsOut}
            />
          </div>

          {page === 'history' && <History transactions={transactions} />}
          {page === 'reports' && <Reports items={items} transactions={transactions} />}
        </div>
      </main>
    </div>
  )
}

function Login({ configurationError = false }: { configurationError?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (configurationError) {
      setError('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY terlebih dahulu.')
      setBusy(false)
      return
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) setError('Email atau kata sandi salah.')
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-[#f2f8f7] grid lg:grid-cols-2">
      <div className="hidden lg:flex bg-teal-700 p-16 text-white flex-col justify-between relative overflow-hidden">
        <div>
          <div className="flex items-center gap-3 text-2xl font-bold">
            <img src={logo} alt="Logo Inventaris Rekap" className="h-12 w-12 rounded-lg object-contain bg-white p-1" />
            INVENTARIS REKAP
          </div>
          <h1 className="text-5xl font-bold leading-tight mt-28 max-w-lg">
            Kelola inventaris kantor dengan lebih teratur.
          </h1>
          <p className="text-teal-100 mt-6 max-w-md text-lg">
            Pantau stok, catat transaksi, dan buat laporan dengan mudah dari satu tempat.
          </p>
        </div>
        <p className="text-teal-200 text-sm">Sistem Informasi Inventaris ATK • KCU KARAWANG</p>
        <div className="absolute -right-24 -bottom-24 h-80 w-80 border-[40px] border-white/10 rounded-full" />
      </div>
      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-soft p-8 w-full max-w-md">
          <div className="mb-8">
            <img src={logo} alt="Logo Inventaris Rekap" className="h-12 w-12 rounded-xl object-contain mb-5" />
            <h2 className="text-2xl font-bold text-ink">Selamat datang kembali</h2>
            <p className="text-slate-500 mt-2">Masuk ke panel admin inventaris Anda.</p>
          </div>
          <label>
            Email admin
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email admin" />
          </label>
          <label className="mt-4">
            Kata sandi
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Masukkan kata sandi" />
          </label>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          <button className="btn-primary w-full mt-7" disabled={busy || configurationError}>
            {configurationError ? 'Supabase belum dikonfigurasi' : busy ? 'Memproses...' : 'Masuk ke Dashboard'}
          </button>
          <p className="text-center text-xs text-slate-400 mt-4">Akses terbatas untuk administrator terdaftar.</p>
        </form>
      </div>
    </div>
  )
}

function Sidebar({ page, setPage, open, close, onLogout, draftCount }: { page: Page; setPage: (p: Page) => void; open: boolean; close: () => void; onLogout: () => void; draftCount: number }) {
  return (
    <>
      <div className={`fixed inset-0 bg-slate-900/30 z-30 lg:hidden ${open ? '' : 'hidden'}`} onClick={close} />
      <aside className={`fixed z-40 inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-20 px-7 flex items-center gap-3 border-b border-slate-100">
          <img src={logo} alt="Logo Inventaris Rekap" className="h-9 w-9 rounded-lg object-contain" />
          <div>
            <p className="font-extrabold text-ink">INVENTARIS <span className="text-teal-600">REKAP</span></p>
            <p className="text-[10px] text-slate-400 tracking-wider">KCU KARAWANG</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={close}><X size={20} /></button>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setPage(id); close() }} className={`nav-item ${page === id ? 'active' : ''}`}>
              <Icon size={19} />
              <span className="flex-1 text-left">{label}</span>
              {id === 'transactions' && draftCount > 0 && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-extrabold bg-amber-400 text-amber-900 leading-none">
                  {draftCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="m-4 p-4 bg-teal-50 rounded-xl">
          <p className="text-xs font-semibold text-teal-800">Status Sistem</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-teal-700">
            <span className="h-2 w-2 rounded-full bg-teal-500" /> Database terhubung
          </div>
        </div>
        <button className="m-4 mt-0 nav-item text-slate-500" onClick={onLogout}>
          <LogOut size={18} />Keluar
        </button>
      </aside>
    </>
  )
}

function Dashboard({ items, transactions, onOpenStockEntry }: { items: Item[]; transactions: Transaction[]; onOpenStockEntry: (item: Item) => void }) {
  const total = items.reduce((a, i) => a + Math.round(Number(i.current_stock || 0)), 0)
  const low = items.filter(i => Number(i.current_stock) > 0 && Number(i.current_stock) <= (Number(i.minimum_stock) || 5)).length
  const empty = items.filter(i => Number(i.current_stock) === 0).length
  const currentYear = new Date().getFullYear()
  const transactionYears = transactions.map(t => Number(t.transaction_date.slice(0, 4))).filter(year => Number.isFinite(year))
  const years = [...new Set([currentYear, ...transactionYears])].sort((a, b) => b - a)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'low' | 'empty'>('all')
  const [stockPage, setStockPage] = useState(1)
  const stockPageSize = 5
  const monthTransactions = transactions.filter(t => Number(t.transaction_date.slice(0, 4)) === selectedYear && Number(t.transaction_date.slice(5, 7)) === selectedMonth)
  const totalIn = monthTransactions.filter(t => t.type === 'in').reduce((n, t) => n + Number(t.quantity || 0), 0)
  const totalOut = monthTransactions.filter(t => t.type === 'out').reduce((n, t) => n + Number(t.quantity || 0), 0)
  const stats = [
    { label: 'Jenis Barang', value: items.length, sub: 'Total item terdaftar', icon: Boxes, color: 'blue' },
    { label: 'Total Stok Tersedia', value: formatNumber(total), sub: 'Stok aktual saat ini', icon: Package, color: 'teal' },
    { label: 'Barang Masuk', value: formatNumber(Math.round(totalIn)), sub: `Transaksi bulan ${months[selectedMonth - 1]}`, icon: ArrowDownToLine, color: 'violet' },
    { label: 'Barang Keluar', value: formatNumber(Math.round(totalOut)), sub: `Transaksi bulan ${months[selectedMonth - 1]}`, icon: ArrowUpFromLine, color: 'orange' }
  ]
  const activity = months.map((month, i) => {
    const monthIndex = i + 1
    const entries = transactions.filter(t => Number(t.transaction_date.slice(0, 4)) === selectedYear && Number(t.transaction_date.slice(5, 7)) === monthIndex)
    return {
      month,
      monthIndex,
      masuk: Math.round(entries.filter(t => t.type === 'in').reduce((n, t) => n + Number(t.quantity || 0), 0)),
      keluar: Math.round(entries.filter(t => t.type === 'out').reduce((n, t) => n + Number(t.quantity || 0), 0))
    }
  })
  const selectMonth = (monthIndex: number) => setSelectedMonth(monthIndex)
  const statusItems = items.filter(item =>
    statusFilter === 'safe'
      ? Number(item.current_stock) > (Number(item.minimum_stock) || 5)
      : statusFilter === 'low'
      ? Number(item.current_stock) > 0 && Number(item.current_stock) <= (Number(item.minimum_stock) || 5)
      : statusFilter === 'empty'
      ? Number(item.current_stock) === 0
      : true
  )
  const statusLabel = statusFilter === 'safe' ? 'Aman' : statusFilter === 'low' ? 'Stok menipis' : statusFilter === 'empty' ? 'Stok habis' : 'Semua status'
  const sortedStatusItems = [...statusItems].sort((a, b) => Number(a.current_stock) - Number(b.current_stock))
  const stockPageCount = Math.max(1, Math.ceil(sortedStatusItems.length / stockPageSize))
  const visibleStatusItems = statusFilter === 'all'
    ? sortedStatusItems.slice(0, 4)
    : sortedStatusItems.slice((stockPage - 1) * stockPageSize, stockPage * stockPageSize)

  useEffect(() => setStockPage(1), [statusFilter])
  useEffect(() => {
    if (stockPage > stockPageCount) setStockPage(stockPageCount)
  }, [stockPage, stockPageCount])

  return (
    <>
      <div className="mb-7">
        <p className="eyebrow">RINGKASAN INVENTARIS</p>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="title">Dashboard Inventaris</h1>
            <p className="subtitle">Ringkasan kondisi stok dan transaksi kantor.</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 md:w-auto">
            <label className="md:w-32">
              Tahun
              <select aria-label="Filter tahun dashboard" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                {years.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="md:w-32">
              Bulan
              <select aria-label="Filter bulan dashboard" value={selectedMonth} onChange={e => selectMonth(Number(e.target.value))}>
                {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, sub, icon: Icon, color }) => (
          <div className="card p-5" key={label}>
            <div className="flex justify-between">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-ink mt-2">{value}</p>
              </div>
              <div className={`stat-icon ${color}`}><Icon size={20} /></div>
            </div>
            <p className="text-xs text-slate-400 mt-4">{sub}</p>
          </div>
        ))}
      </div>
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="card p-5 xl:col-span-2">
          <div className="flex justify-between items-center mb-5">
            <div>
              <h3 className="section-title">Aktivitas transaksi</h3>
              <p className="text-xs text-slate-400 mt-1">Klik batang grafik untuk memilih bulan</p>
            </div>
            <span className="badge bg-teal-50 text-teal-700">{months[selectedMonth - 1]} {selectedYear}</span>
          </div>
          <ResponsiveContainer width="100%" height={265}>
            <BarChart
              data={activity}
              barGap={6}
              onClick={state => {
                const monthIndex = state?.activePayload?.[0]?.payload?.monthIndex
                if (typeof monthIndex === 'number') selectMonth(monthIndex)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickFormatter={value => formatNumber(value)} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip formatter={value => formatNumber(Number(value))} />
              <Bar dataKey="masuk" name="Barang masuk" fill="#1f4e85" radius={[4, 4, 0, 0]} cursor="pointer" onClick={entry => selectMonth(entry.monthIndex)} />
              <Bar dataKey="keluar" name="Barang keluar" fill="#94a3b8" radius={[4, 4, 0, 0]} cursor="pointer" onClick={entry => selectMonth(entry.monthIndex)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="section-title">Status stok</h3>
          <p className="text-xs text-slate-400 mt-1">Klik status untuk memfilter daftar di bawah</p>
          <div className="flex items-center justify-center my-3">
            <div className="relative w-40 h-40">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={[{ name: 'Aman', value: items.length - low - empty }, { name: 'Menipis', value: low }, { name: 'Habis', value: empty }]} innerRadius={52} outerRadius={70} dataKey="value" stroke="none">
                    <Cell fill="#1f4e85" cursor="pointer" onClick={() => setStatusFilter('safe')} />
                    <Cell fill="#f59e0b" cursor="pointer" onClick={() => setStatusFilter('low')} />
                    <Cell fill="#ef4444" cursor="pointer" onClick={() => setStatusFilter('empty')} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center"><span className="text-2xl font-bold">{items.length}</span></div>
            </div>
          </div>
          <div className="space-y-3">
            {[['Aman', items.length - low - empty, 'bg-teal-500', 'safe'], ['Stok menipis', low, 'bg-amber-500', 'low'], ['Stok habis', empty, 'bg-red-500', 'empty']].map(([x, n, c, filter]) => (
              <button
                className={`flex w-full justify-between text-sm rounded-md px-2 py-1 transition hover:bg-slate-50 ${statusFilter === filter ? 'bg-slate-50 ring-1 ring-teal-200' : ''}`}
                key={x as string}
                onClick={() => setStatusFilter(filter as 'safe' | 'low' | 'empty')}
              >
                <span className="flex items-center gap-2"><i className={`h-2 w-2 rounded-full ${c}`} />{x}</span>
                <b>{n}</b>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card mt-6 p-5">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="section-title">Stok perlu diperhatikan</h3>
            <p className="text-xs text-slate-400 mt-1">Filter aktif: {statusLabel} • Klik nama barang untuk mencatat barang masuk</p>
          </div>
          {statusFilter !== 'all' && (
            <button className="btn-secondary !px-3 !py-2 text-xs" onClick={() => { setStatusFilter('all'); setStockPage(1) }}>
              Tampilkan semua
            </button>
          )}
        </div>
        <ItemTable items={visibleStatusItems} onItemClick={onOpenStockEntry} />
        {statusFilter !== 'all' && stockPageCount > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400">Halaman {stockPage} dari {stockPageCount}</p>
            <div className="flex gap-2">
              <button className="btn-secondary !px-3 !py-2 text-xs" disabled={stockPage === 1} onClick={() => setStockPage(page => page - 1)}>Sebelumnya</button>
              <button className="btn-secondary !px-3 !py-2 text-xs" disabled={stockPage === stockPageCount} onClick={() => setStockPage(page => page + 1)}>Berikutnya</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ItemTable({ items, actions, onItemClick }: { items: Item[]; actions?: (item: Item) => React.ReactNode; onItemClick?: (item: Item) => void }) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama barang</th>
            <th>Kategori</th>
            <th>Stok tersedia</th>
            <th>Status</th>
            {actions && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id} className={onItemClick ? 'cursor-pointer hover:bg-slate-50' : ''} onClick={() => onItemClick?.(i)}>
              <td className="font-mono text-xs text-teal-700">{i.code}</td>
              <td className="font-semibold text-slate-700">{i.name}</td>
              <td>{i.category}</td>
              <td className="font-semibold">{formatNumber(i.current_stock)} <span className="font-normal text-slate-400">{i.unit}</span></td>
              <td>
                <span className={`badge ${Number(i.current_stock) === 0 ? 'bg-red-50 text-red-600' : Number(i.current_stock) <= (Number(i.minimum_stock) || 5) ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-700'}`}>
                  {Number(i.current_stock) === 0 ? 'Habis' : Number(i.current_stock) <= (Number(i.minimum_stock) || 5) ? 'Menipis' : 'Aman'}
                </span>
              </td>
              {actions && <td>{actions(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Items({ items, transactions, setItems }: { items: Item[]; transactions: Transaction[]; setItems: React.Dispatch<React.SetStateAction<Item[]>> }) {
  const emptyForm = { code: '', name: '', unit: 'Buah', opening_stock: 0, minimum_stock: 5 }
  const [query, setQuery] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState(emptyForm)
  const filtered = items.filter(i => `${i.code} ${i.name}`.toLowerCase().includes(query.toLowerCase()))

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShow(true) }
  const openEdit = (item: Item) => { setEditing(item); setForm({ code: item.code, name: item.name, unit: item.unit, opening_stock: Number(item.opening_stock), minimum_stock: Number(item.minimum_stock) || 5 }); setShow(true) }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { code: form.code.trim(), name: form.name.trim(), unit: form.unit, minimum_stock: Number(form.minimum_stock) || 5 }
    if (editing) {
      const { data, error } = await supabase.from('items').update(payload).eq('id', editing.id).select().single()
      if (error) return alert(error.message)
      if (data) setItems(v => v.map(item => item.id === editing.id ? data : item))
    } else {
      const item = { ...payload, id: crypto.randomUUID(), category: 'ATK', current_stock: Number(form.opening_stock), opening_stock: Number(form.opening_stock) }
      const { data, error } = await supabase.from('items').insert(item).select().single()
      if (error) return alert(error.message)
      if (data) setItems(v => [...v, data])
    }
    setShow(false)
  }

  const remove = async (item: Item) => {
    if (transactions.some(transaction => transaction.item_id === item.id)) {
      return alert('Barang tidak dapat dihapus karena sudah memiliki transaksi. Gunakan update jika masih diperlukan.')
    }
    if (!window.confirm(`Hapus barang "${item.name}"?`)) return
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) return alert(error.message)
    setItems(v => v.filter(current => current.id !== item.id))
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6">
        <div>
          <p className="eyebrow">MASTER DATA</p>
          <h1 className="title">Data Barang</h1>
          <p className="subtitle">Kelola data dasar barang ATK.</p>
        </div>
        <button className="btn-primary mt-4 md:mt-0" onClick={openCreate}>
          <Plus size={17} />Tambah Barang
        </button>
      </div>
      <div className="card p-4 mb-5">
        <div className="search">
          <Search size={17} />
          <input placeholder="Cari kode atau nama barang..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="card p-5">
        <h3 className="section-title mb-4">Daftar barang <span className="text-slate-400 font-normal text-sm">({filtered.length} item)</span></h3>
        <ItemTable
          items={filtered}
          actions={item => (
            <div className="flex gap-2">
              <button className="btn-secondary !px-3 !py-2" title="Update barang" onClick={() => openEdit(item)}><Pencil size={14} /></button>
              <button className="btn-secondary !px-3 !py-2 text-red-600" title="Hapus barang" onClick={() => remove(item)}><Trash2 size={14} /></button>
            </div>
          )}
        />
      </div>
      {show && (
        <Modal title={editing ? 'Update barang' : 'Tambah barang baru'} close={() => setShow(false)}>
          <form onSubmit={save} className="space-y-4">
            <label>Indeks / kode barang<input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="ATK-006" /></label>
            <label>Nama barang<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>Satuan
              <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                <option>Buah</option><option>PCS</option><option>Lembar</option><option>Ikat</option><option>Lusin</option><option>Rim</option><option>Kotak</option><option>Pak</option><option>Botol</option><option>Dus</option><option>Roll</option><option>Slop</option>
              </select>
            </label>
            {!editing && <label>Stok awal<input type="number" min="0" required value={form.opening_stock} onChange={e => setForm({ ...form, opening_stock: Number(e.target.value) })} /></label>}
            <label>Stok minimum<input type="number" min="0" required value={form.minimum_stock} onChange={e => setForm({ ...form, minimum_stock: Number(e.target.value) })} /></label>
            <div className="flex justify-end gap-2 mt-2">
              <button type="button" className="btn-secondary" onClick={() => setShow(false)}>Batal</button>
              <button className="btn-primary">{editing ? 'Update barang' : 'Simpan barang'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

function TransactionsPage({
  items,
  setItems,
  transactions,
  setTransactions,
  initialItemId,
  onClearInitialItemId,
  onDeleteTransaction,
  headerIn,
  setHeaderIn,
  draftIn,
  setDraftIn,
  headerOut,
  setHeaderOut,
  draftOut,
  setDraftOut
}: {
  items: Item[]
  setItems: React.Dispatch<React.SetStateAction<Item[]>>
  transactions: Transaction[]
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>
  initialItemId: string | null
  onClearInitialItemId: () => void
  onDeleteTransaction: (tx: Transaction) => void
  headerIn: { transaction_date: string; recipient: string; initials: string }
  setHeaderIn: React.Dispatch<React.SetStateAction<{ transaction_date: string; recipient: string; initials: string }>>
  draftIn: DraftTransactionItem[]
  setDraftIn: React.Dispatch<React.SetStateAction<DraftTransactionItem[]>>
  headerOut: { transaction_date: string; recipient: string; initials: string }
  setHeaderOut: React.Dispatch<React.SetStateAction<{ transaction_date: string; recipient: string; initials: string }>>
  draftOut: DraftTransactionItem[]
  setDraftOut: React.Dispatch<React.SetStateAction<DraftTransactionItem[]>>
}) {
  const [activeTab, setActiveTab] = useState<TransactionType>('in')
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, type, title, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    if (initialItemId) {
      setActiveTab('in')
    }
  }, [initialItemId])

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <p className="eyebrow">TRANSAKSI STOK</p>
          <h1 className="title !text-xl md:!text-2xl !mt-0.5">Barang Masuk dan Barang Keluar</h1>
          <p className="subtitle text-xs">
            Catat transaksi dalam satu kelompok per tanggal dan penunjukan. Tambahkan banyak barang sekaligus secara praktis.
          </p>
        </div>

        {/* User-friendly summary quick badge */}
        <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-500 shadow-xs self-start md:self-auto">
          <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
          <span>Sistem Batch Aktif</span>
        </div>
      </div>

      {/* Modern Segmented Tab Switcher */}
      <div className="bg-slate-200/60 p-1 rounded-xl inline-flex gap-2 mb-4 max-w-full overflow-x-auto shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab('in')}
          className={`flex items-center gap-2.5 px-6 py-2.5 font-bold text-sm rounded-xl transition-all duration-200 ${
            activeTab === 'in'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <ArrowDownToLine size={18} />
          <span>Barang Masuk</span>
          {draftIn.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'in' ? 'bg-white text-teal-800' : 'bg-teal-100 text-teal-800'
              }`}
            >
              {draftIn.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('out')}
          className={`flex items-center gap-2.5 px-6 py-2.5 font-bold text-sm rounded-xl transition-all duration-200 ${
            activeTab === 'out'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <ArrowUpFromLine size={18} />
          <span>Barang Keluar</span>
          {draftOut.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
                activeTab === 'out' ? 'bg-white text-orange-900' : 'bg-orange-100 text-orange-800'
              }`}
            >
              {draftOut.length}
            </span>
          )}
        </button>
      </div>

      {/* Render active section */}
      {activeTab === 'in' ? (
        <TransactionBatchSection
          type="in"
          items={items}
          setItems={setItems}
          transactions={transactions}
          setTransactions={setTransactions}
          header={headerIn}
          setHeader={setHeaderIn}
          draftItems={draftIn}
          setDraftItems={setDraftIn}
          initialItemId={initialItemId}
          onClearInitialItemId={onClearInitialItemId}
          onDeleteTransaction={onDeleteTransaction}
          addToast={addToast}
        />
      ) : (
        <TransactionBatchSection
          type="out"
          items={items}
          setItems={setItems}
          transactions={transactions}
          setTransactions={setTransactions}
          header={headerOut}
          setHeader={setHeaderOut}
          draftItems={draftOut}
          setDraftItems={setDraftOut}
          onDeleteTransaction={onDeleteTransaction}
          addToast={addToast}
        />
      )}
    </>
  )
}

function TransactionBatchSection({
  type,
  items,
  setItems,
  transactions,
  setTransactions,
  header,
  setHeader,
  draftItems,
  setDraftItems,
  initialItemId = null,
  onClearInitialItemId,
  onDeleteTransaction,
  addToast
}: {
  type: TransactionType
  items: Item[]
  setItems: React.Dispatch<React.SetStateAction<Item[]>>
  transactions: Transaction[]
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>
  header: { transaction_date: string; recipient: string; initials: string }
  setHeader: React.Dispatch<React.SetStateAction<{ transaction_date: string; recipient: string; initials: string }>>
  draftItems: DraftTransactionItem[]
  setDraftItems: React.Dispatch<React.SetStateAction<DraftTransactionItem[]>>
  initialItemId?: string | null
  onClearInitialItemId?: () => void
  onDeleteTransaction?: (tx: Transaction) => void
  addToast: (type: 'success' | 'error' | 'info', title: string, message?: string) => void
}) {
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [itemQuery, setItemQuery] = useState('')
  const [quantity, setQuantity] = useState<number | ''>('')
  const [expandedDraftIds, setExpandedDraftIds] = useState<Set<string>>(new Set())
  const [editingTempId, setEditingTempId] = useState<string | null>(null)
  const [editQuantity, setEditQuantity] = useState<number>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const itemInputRef = useRef<HTMLInputElement>(null)

  // Handle initialItemId from Dashboard
  useEffect(() => {
    if (type !== 'in' || !initialItemId) return
    const initialItem = items.find(i => i.id === initialItemId)
    if (initialItem) {
      setSelectedItemId(initialItem.id)
      setItemQuery(`${initialItem.code} — ${initialItem.name}`)
      onClearInitialItemId?.()
    }
  }, [initialItemId, items, type, onClearInitialItemId])

  const selectedItem = items.find(i => i.id === selectedItemId)

  // Calculate already added quantity in draft for selected item
  const alreadyInDraftForSelectedItem = selectedItem
    ? draftItems.filter(d => d.itemId === selectedItem.id).reduce((sum, d) => sum + d.quantity, 0)
    : 0

  const remainingAvailableStock = selectedItem
    ? Math.max(0, selectedItem.current_stock - alreadyInDraftForSelectedItem)
    : 0

  // Penunjukan changes: auto-sync paraf!
  const handleRecipientChange = (val: string) => {
    setHeader(prev => ({
      ...prev,
      recipient: val,
      initials: val // Paraf otomatis mengikuti penunjukan
    }))
  }

  // Toggle single accordion item
  const toggleDraftAccordion = (tempId: string) => {
    setExpandedDraftIds(prev => {
      const next = new Set(prev)
      if (next.has(tempId)) next.delete(tempId)
      else next.add(tempId)
      return next
    })
  }

  // Expand or Collapse all items
  const toggleAllAccordions = () => {
    if (expandedDraftIds.size === draftItems.length) {
      setExpandedDraftIds(new Set())
    } else {
      setExpandedDraftIds(new Set(draftItems.map(d => d.tempId)))
    }
  }

  // Quick quantity buttons helper
  const adjustQuantity = (amount: number) => {
    const current = Number(quantity) || 0
    const newQty = Math.max(1, current + amount)
    if (type === 'out' && selectedItem && newQty > remainingAvailableStock) {
      setQuantity(remainingAvailableStock)
    } else {
      setQuantity(newQty)
    }
  }

  // Add Item to Temporary Draft
  const handleAddDraftItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedItem) {
      addToast('error', 'Pilih Barang Dulu', 'Silakan ketik atau pilih nama barang dari daftar.')
      itemInputRef.current?.focus()
      return
    }
    const numQty = Number(quantity)
    if (!Number.isInteger(numQty) || numQty <= 0) {
      addToast('error', 'Jumlah Tidak Valid', 'Jumlah barang harus berupa bilangan bulat lebih besar dari nol.')
      return
    }

    // For Barang Keluar, validate stock availability
    if (type === 'out') {
      const totalRequested = alreadyInDraftForSelectedItem + numQty
      if (totalRequested > selectedItem.current_stock) {
        addToast(
          'error',
          'Stok Tidak Mencukupi',
          `Stok saat ini ${formatNumber(selectedItem.current_stock)} ${selectedItem.unit}. Di keranjang sudah ada ${formatNumber(alreadyInDraftForSelectedItem)} ${selectedItem.unit}.`
        )
        return
      }
    }

    // Jika barang yang sama sudah ada di keranjang, akumulasikan jumlahnya
    // Penting: cek & update dilakukan di dalam functional updater agar tidak terjadi stale closure
    let wasExisting = false
    let finalQuantity = numQty

    setDraftItems(prev => {
      const existingIndex = prev.findIndex(
        d =>
          d.itemId === selectedItem.id ||
          (d.item?.code && d.item.code.toLowerCase() === selectedItem.code.toLowerCase())
      )

      if (existingIndex !== -1) {
        wasExisting = true
        finalQuantity = prev[existingIndex].quantity + numQty
        return prev.map((d, idx) =>
          idx === existingIndex ? { ...d, quantity: finalQuantity } : d
        )
      }

      // Barang belum ada di keranjang, tambahkan sebagai baris baru
      return [
        ...prev,
        {
          tempId: crypto.randomUUID(),
          itemId: selectedItem.id,
          item: selectedItem,
          quantity: numQty
        }
      ]
    })

    // Toast ditampilkan setelah setState (nilai wasExisting/finalQuantity di-set dalam updater)
    setTimeout(() => {
      if (wasExisting) {
        addToast(
          'success',
          'Kuantitas Barang Bertambah',
          `"${selectedItem.name}" bertambah +${numQty} (Total sekarang: ${finalQuantity} ${selectedItem.unit}).`
        )
      } else {
        addToast(
          'success',
          'Barang Ditambahkan ke Keranjang',
          `${selectedItem.name} (${numQty} ${selectedItem.unit})`
        )
      }
    }, 0)

    // Reset item input form for the next item and autofocus search
    setSelectedItemId('')
    setItemQuery('')
    setQuantity('')
    setTimeout(() => {
      itemInputRef.current?.focus()
    }, 50)
  }

  // Remove Draft Item
  const handleRemoveDraftItem = (tempId: string, itemName: string) => {
    setDraftItems(prev => prev.filter(d => d.tempId !== tempId))
    setExpandedDraftIds(prev => {
      const next = new Set(prev)
      next.delete(tempId)
      return next
    })
    if (editingTempId === tempId) {
      setEditingTempId(null)
    }
    addToast('info', 'Barang Dihapus', `"${itemName}" dihapus dari keranjang sementara.`)
  }

  // Start Inline Edit
  const handleStartEdit = (d: DraftTransactionItem) => {
    setEditingTempId(d.tempId)
    setEditQuantity(d.quantity)
    setExpandedDraftIds(prev => new Set(prev).add(d.tempId))
  }

  // Save Inline Edit
  const handleSaveEdit = (tempId: string, item: Item) => {
    const numQty = Number(editQuantity)
    if (!Number.isInteger(numQty) || numQty <= 0) {
      addToast('error', 'Jumlah Tidak Valid', 'Jumlah harus lebih besar dari nol.')
      return
    }

    if (type === 'out') {
      const otherDraftQty = draftItems
        .filter(d => d.itemId === item.id && d.tempId !== tempId)
        .reduce((sum, d) => sum + d.quantity, 0)
      if (otherDraftQty + numQty > item.current_stock) {
        addToast(
          'error',
          'Stok Kurang',
          `Sisa stok tidak mencukupi untuk jumlah ${numQty} ${item.unit}.`
        )
        return
      }
    }

    setDraftItems(prev => prev.map(d => (d.tempId === tempId ? { ...d, quantity: numQty } : d)))
    setEditingTempId(null)
    addToast('success', 'Jumlah Diperbarui', `Jumlah barang telah diperbarui menjadi ${numQty} ${item.unit}.`)
  }

  // Save Entire Transaction Group to Supabase
  const handleSaveTransactionGroup = async () => {
    if (draftItems.length === 0) {
      return addToast('error', 'Keranjang Masih Kosong', 'Tambahkan minimal 1 barang ke keranjang sementara.')
    }
    if (!header.transaction_date) {
      return addToast('error', 'Tanggal Kosong', 'Pilih tanggal transaksi terlebih dahulu.')
    }
    if (!header.recipient.trim()) {
      return addToast(
        'error',
        'Penunjukan Wajib Diisi',
        type === 'in'
          ? 'Isi informasi penunjukan / sumber barang terlebih dahulu.'
          : 'Isi informasi penunjukan / nama pemohon barang terlebih dahulu.'
      )
    }
    if (!header.initials.trim()) {
      return addToast('error', 'Paraf Wajib Diisi', 'Isi paraf terlebih dahulu.')
    }

    // Recheck stock for all items if type === 'out'
    if (type === 'out') {
      const cumulativeQty = new Map<string, number>()
      for (const d of draftItems) {
        cumulativeQty.set(d.itemId, (cumulativeQty.get(d.itemId) || 0) + d.quantity)
      }
      for (const [itemId, totalQty] of cumulativeQty.entries()) {
        const it = items.find(i => i.id === itemId)
        if (!it || it.current_stock < totalQty) {
          return addToast(
            'error',
            'Stok Tidak Cukup',
            `Stok untuk "${it?.name || 'Barang'}" tidak mencukupi (Tersedia: ${it?.current_stock || 0}, Diminta: ${totalQty}).`
          )
        }
      }
    }

    setIsSubmitting(true)
    try {
      const savedTransactions: Transaction[] = []

      // Try batch RPC first
      const batchPayload = draftItems.map(d => ({
        item_id: d.itemId,
        quantity: d.quantity,
        notes: d.notes || null
      }))

      const { data: batchData, error: batchError } = await supabase.rpc('record_stock_transactions_batch', {
        p_type: type,
        p_date: header.transaction_date,
        p_officer: 'Admin Inventaris',
        p_initials: header.initials.trim() || null,
        p_recipient: header.recipient.trim() || null,
        p_source: type === 'in' ? header.recipient.trim() || null : null,
        p_items: batchPayload
      })

      if (!batchError && Array.isArray(batchData) && batchData.length > 0) {
        batchData.forEach(tx => {
          const matchingItem = items.find(i => i.id === tx.item_id)
          savedTransactions.push({
            ...tx,
            item: matchingItem ? { code: matchingItem.code, name: matchingItem.name, unit: matchingItem.unit } : undefined
          })
        })
      } else {
        // Fallback: sequential RPC record_stock_transaction
        for (const d of draftItems) {
          const { data: tx, error: txError } = await supabase.rpc('record_stock_transaction', {
            p_item_id: d.itemId,
            p_type: type,
            p_quantity: d.quantity,
            p_date: header.transaction_date,
            p_officer: 'Admin Inventaris',
            p_initials: header.initials.trim() || null,
            p_recipient: header.recipient.trim() || null,
            p_source: type === 'in' ? header.recipient.trim() || null : null
          })

          if (txError) {
            throw new Error(`Gagal menyimpan "${d.item.name}": ${txError.message}`)
          }
          if (tx) {
            savedTransactions.push({
              ...tx,
              item: { code: d.item.code, name: d.item.name, unit: d.item.unit }
            })
          }
        }
      }

      // Update local items state with newly computed balances
      setItems(prevItems => {
        const deltas = new Map<string, number>()
        for (const draft of draftItems) {
          const delta = type === 'in' ? draft.quantity : -draft.quantity
          deltas.set(draft.itemId, (deltas.get(draft.itemId) || 0) + delta)
        }
        return prevItems.map(item => {
          const delta = deltas.get(item.id)
          if (delta !== undefined) {
            return { ...item, current_stock: item.current_stock + delta }
          }
          return item
        })
      })

      // Prepend newly recorded transactions
      setTransactions(prev => [...savedTransactions, ...prev])

      const savedCount = draftItems.length
      addToast(
        'success',
        'Transaksi Berhasil Disimpan!',
        `${savedCount} jenis barang berhasil dicatat dan stok aktual telah diperbarui.`
      )

      // Clear draft list
      setDraftItems([])
      setExpandedDraftIds(new Set())
      setSelectedItemId('')
      setItemQuery('')
      setQuantity('')
    } catch (err: any) {
      console.error('Error saat menyimpan transaksi:', err)
      addToast('error', 'Gagal Menyimpan', err?.message || 'Terjadi kendala saat menyimpan transaksi ke database.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalDraftUnits = draftItems.reduce((acc, d) => acc + d.quantity, 0)
  const isOutOfStockForOut = type === 'out' && selectedItem && remainingAvailableStock <= 0
  const isQuantityExceeded = type === 'out' && selectedItem && Number(quantity) > remainingAvailableStock

  return (
    <div className="space-y-4">
      {/* Card 1: Informasi Kelompok Transaksi (Langkah 1) - Bar Horizontal Ringkas di Atas */}
      <section className={`card p-4 border-t-4 transition-all duration-200 ${
        type === 'in' ? 'border-t-teal-600' : 'border-t-orange-500'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-3 border-b border-slate-100 gap-1.5">
          <div className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full font-bold text-xs grid place-items-center ${
              type === 'in' ? 'bg-teal-100 text-teal-800' : 'bg-orange-100 text-orange-800'
            }`}>
              1
            </span>
            <h2 className="section-title text-sm font-bold">
              Informasi Kelompok Transaksi {type === 'in' ? 'Masuk' : 'Keluar'}
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">
              • Diisi 1 kali di awal untuk seluruh barang
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-teal-600 font-medium">
            <Sparkles size={12} className="shrink-0 text-teal-500" />
            <span>Paraf otomatis sinkron dengan penunjukan</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Tanggal transaksi</label>
            <input
              type="date"
              lang="id-ID"
              required
              value={header.transaction_date}
              onChange={e => setHeader(prev => ({ ...prev, transaction_date: e.target.value }))}
              className="!mt-1 text-sm py-2 px-3"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              {type === 'in' ? 'Penunjukan / Sumber Barang' : 'Penunjukan / Nama Pemohon'}
            </label>
            <input
              required
              placeholder={
                type === 'in'
                  ? 'Contoh: Supplier ATK / Bagian Logistik'
                  : 'Contoh: Budi Santoso (Bagian Pelayanan)'
              }
              value={header.recipient}
              onChange={e => handleRecipientChange(e.target.value)}
              className="!mt-1 text-sm py-2 px-3"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Paraf</label>
            <input
              required
              placeholder="Otomatis mengikuti penunjukan"
              value={header.initials}
              onChange={e => setHeader(prev => ({ ...prev, initials: e.target.value }))}
              className="!mt-1 text-sm py-2 px-3"
            />
          </div>
        </div>
      </section>

      {/* Grid: Langkah 2 (Form Barang) & Langkah 3 (Keranjang) - Langsung Terlihat Sejajar Tanpa Perlu Scroll! */}
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        {/* Left Column: Form Pilih & Tambah Barang Langsung di Paling Atas */}
        <div className="lg:col-span-5">
          <section className="card p-4 sm:p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <span className={`h-6 w-6 rounded-full font-bold text-xs grid place-items-center ${
                type === 'in' ? 'bg-teal-100 text-teal-800' : 'bg-orange-100 text-orange-800'
              }`}>
                2
              </span>
              <div>
                <h2 className="section-title text-sm md:text-base">Pilih & Tambah Barang</h2>
                <p className="text-xs text-slate-400">
                  Pilih barang, tentukan jumlah, lalu tambahkan ke keranjang.
                </p>
              </div>
            </div>

            <form onSubmit={handleAddDraftItem} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Nama barang</label>
                <div className="relative !mt-1">
                  <input
                    ref={itemInputRef}
                    list={`items-datalist-${type}`}
                    required
                    value={itemQuery}
                    onChange={e => {
                      const value = e.target.value
                      setItemQuery(value)
                      const selected = items.find(
                        i =>
                          `${i.code} — ${i.name}`.toLowerCase() === value.toLowerCase() ||
                          i.name.toLowerCase() === value.toLowerCase() ||
                          i.code.toLowerCase() === value.toLowerCase()
                      )
                      setSelectedItemId(selected?.id || '')
                    }}
                    placeholder={items.length ? 'Ketik nama atau kode barang...' : 'Belum ada data barang'}
                    className="pr-8 text-sm py-2"
                  />
                  {itemQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setItemQuery('')
                        setSelectedItemId('')
                        itemInputRef.current?.focus()
                      }}
                      className="absolute right-2.5 top-[10px] text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <datalist id={`items-datalist-${type}`}>
                  {items.map(i => (
                    <option key={i.id} value={`${i.code} — ${i.name}`} />
                  ))}
                </datalist>
              </div>

              {/* Compact Visual Item Preview Card */}
              {selectedItem ? (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                    type === 'in' ? 'bg-teal-50/70 border-teal-200' : 'bg-orange-50/70 border-orange-200'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-teal-700 font-bold shrink-0">
                        {selectedItem.code}
                      </span>
                      <span className="font-bold text-slate-800 truncate">{selectedItem.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Kategori: {selectedItem.category || 'ATK'} • Satuan: {selectedItem.unit}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`badge text-[10px] font-bold ${
                        selectedItem.current_stock === 0
                          ? 'bg-red-100 text-red-700'
                          : selectedItem.current_stock <= (selectedItem.minimum_stock || 5)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-teal-100 text-teal-800'
                      }`}
                    >
                      Stok: {formatNumber(selectedItem.current_stock)} {selectedItem.unit}
                    </span>
                    {type === 'out' && alreadyInDraftForSelectedItem > 0 && (
                      <span className="block text-[10px] text-amber-700 mt-0.5">
                        Di keranjang: {alreadyInDraftForSelectedItem}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Satuan & Kuantitas Input with Stepper Controls */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Satuan</label>
                    <input
                      readOnly
                      tabIndex={-1}
                      value={selectedItem?.unit || 'Otomatis'}
                      className="!mt-1 bg-slate-50 cursor-not-allowed font-medium text-slate-600 border-dashed text-sm py-2"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      {type === 'in' ? 'Jumlah tambah' : 'Jumlah kurang'}
                    </label>
                    <div className="flex items-center !mt-1">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(-1)}
                        disabled={!quantity || Number(quantity) <= 1}
                        className="h-[38px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-l-md border border-r-0 border-slate-300 disabled:opacity-40 transition"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        placeholder="1"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                        className={`!mt-0 h-[38px] text-center font-bold rounded-none ${
                          isQuantityExceeded ? 'border-red-500 bg-red-50 text-red-700' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => adjustQuantity(1)}
                        disabled={type === 'out' && selectedItem && Number(quantity) >= remainingAvailableStock}
                        className="h-[38px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-r-md border border-l-0 border-slate-300 disabled:opacity-40 transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Add Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] text-slate-400 mr-1">Cepat:</span>
                  {[1, 5, 10, 25].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(n)}
                      className="text-xs px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                    >
                      +{n}
                    </button>
                  ))}
                  {type === 'out' && selectedItem && remainingAvailableStock > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuantity(remainingAvailableStock)}
                      className="text-xs px-2 py-0.5 rounded-md bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold transition ml-auto"
                      title="Isi dengan sisa stok maksimal yang tersedia"
                    >
                      Semua Sisa ({remainingAvailableStock})
                    </button>
                  )}
                </div>

                {/* Exceeded Stock Warning */}
                {isQuantityExceeded && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1">
                    <AlertCircle size={14} />
                    Jumlah melebihi sisa stok (Maksimal: {remainingAvailableStock} {selectedItem?.unit})
                  </p>
                )}

                {isOutOfStockForOut && (
                  <p className="text-xs text-red-600 font-semibold flex items-center gap-1">
                    <AlertCircle size={14} />
                    Stok barang ini sudah habis atau seluruhnya telah masuk ke keranjang sementara.
                  </p>
                )}
              </div>

              <div className="pt-1.5">
                <button
                  type="submit"
                  disabled={!selectedItem || !quantity || Number(quantity) <= 0 || isQuantityExceeded || isOutOfStockForOut}
                  className={`btn-primary w-full py-2.5 text-sm font-bold shadow-sm ${
                    type === 'in' ? '!bg-teal-600 hover:!bg-teal-700' : '!bg-orange-500 hover:!bg-orange-600'
                  }`}
                >
                  <Plus size={16} /> Tambah Barang ke Keranjang
                </button>
                <p className="text-center text-[11px] text-slate-400 mt-1.5">
                  Tekan <strong>Enter</strong> untuk langsung menambahkan barang
                </p>
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Keranjang Transaksi Sementara (Langkah 3) */}
        <div className="lg:col-span-7">
          <section className="card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-4">
              <div className="flex items-center gap-3">
                <span className={`h-7 w-7 rounded-full font-bold text-xs grid place-items-center ${
                  type === 'in' ? 'bg-teal-100 text-teal-800' : 'bg-orange-100 text-orange-800'
                }`}>
                  3
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="section-title text-sm md:text-base">Keranjang Transaksi</h2>
                    <span className={`badge ${type === 'in' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-600'}`}>
                      {draftItems.length} Jenis Barang
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Klik baris barang (v) untuk membuka/menutup detail lengkap.
                  </p>
                </div>
              </div>

              {draftItems.length > 0 && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={toggleAllAccordions}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-medium flex items-center gap-1"
                  >
                    {expandedDraftIds.size === draftItems.length ? (
                      <>
                        <ChevronUp size={14} /> Tutup Semua
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} /> Buka Semua
                      </>
                    )}
                  </button>

                  <div className="text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg font-semibold">
                    Total: {formatNumber(totalDraftUnits)} unit
                  </div>
                </div>
              )}
            </div>

            {/* Empty Draft State */}
            {draftItems.length === 0 ? (
              <div className="py-16 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-200 grid place-items-center text-slate-400 mb-3.5">
                  <ShoppingCart size={26} className="text-slate-400" />
                </div>
                <p className="font-bold text-slate-700 text-base">Keranjang transaksi masih kosong</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                  Pilih barang dan tentukan kuantitas pada formulir <strong>Langkah 2</strong> di sebelah kiri, lalu tekan{' '}
                  <span className="text-teal-600 font-bold">"Tambah Barang ke Keranjang"</span>.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {draftItems.map((d, index) => {
                  const isExpanded = expandedDraftIds.has(d.tempId)
                  const isEditing = editingTempId === d.tempId
                  const estimatedFinalStock =
                    type === 'in' ? d.item.current_stock + d.quantity : d.item.current_stock - d.quantity

                  return (
                    <div
                      key={d.tempId}
                      className={`border rounded-xl overflow-hidden transition-all duration-150 ${
                        isExpanded
                          ? 'border-teal-400 bg-white shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      {/* Compact Default Row (Nama Barang | Jumlah | v) */}
                      <div className="flex items-center justify-between p-3.5 bg-white gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDraftAccordion(d.tempId)}
                          className="flex items-center gap-3 text-left flex-1 min-w-0 pr-2 group cursor-pointer"
                        >
                          <span className="h-6 w-6 rounded-md bg-slate-100 text-slate-500 text-xs font-mono font-bold grid place-items-center shrink-0">
                            {index + 1}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-slate-800 text-sm group-hover:text-teal-700 transition">
                              {d.item.name}
                            </span>
                            <span className="text-xs text-slate-400 font-mono ml-2">[{d.item.code}]</span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2.5 shrink-0">
                          {/* Quantity Badge */}
                          <span
                            className={`font-black text-sm px-2.5 py-1 rounded-lg ${
                              type === 'in'
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : 'bg-orange-50 text-orange-700 border border-orange-200'
                            }`}
                          >
                            {type === 'in' ? '+' : '-'}{formatNumber(d.quantity)}{' '}
                            <span className="font-medium text-xs">{d.item.unit}</span>
                          </span>

                          {/* Action Buttons: Edit, Delete, Chevron */}
                          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                            <button
                              type="button"
                              title="Edit jumlah barang ini"
                              onClick={() => handleStartEdit(d)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                            >
                              <Pencil size={15} />
                            </button>

                            <button
                              type="button"
                              title="Hapus barang ini dari keranjang"
                              onClick={() => handleRemoveDraftItem(d.tempId, d.item.name)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                            >
                              <Trash2 size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleDraftAccordion(d.tempId)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition"
                              aria-label={isExpanded ? 'Tutup detail' : 'Buka detail'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Accordion Detail View */}
                      {isExpanded && (
                        <div className="px-4 py-3.5 bg-slate-50/80 border-t border-slate-100 text-sm">
                          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/80">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 text-sm">
                                {d.item.name} — {formatNumber(d.quantity)} {d.item.unit}
                              </span>
                            </div>
                            <span className="badge bg-slate-200 text-slate-700 text-[10px] font-bold">
                              Detail Item
                            </span>
                          </div>

                          {isEditing ? (
                            <div className="bg-white p-4 rounded-xl border border-teal-300 shadow-xs space-y-3">
                              <p className="text-xs font-bold text-slate-700">Ubah Kuantitas Barang</p>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setEditQuantity(q => Math.max(1, q - 1))}
                                  className="h-9 w-9 bg-slate-100 rounded-md border grid place-items-center text-slate-600 hover:bg-slate-200"
                                >
                                  <Minus size={14} />
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={editQuantity}
                                  onChange={e => setEditQuantity(Number(e.target.value))}
                                  className="!mt-0 w-24 text-center font-bold px-2 py-1.5 text-sm border rounded-md"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => setEditQuantity(q => q + 1)}
                                  className="h-9 w-9 bg-slate-100 rounded-md border grid place-items-center text-slate-600 hover:bg-slate-200"
                                >
                                  <Plus size={14} />
                                </button>
                                <span className="text-xs text-slate-500 font-semibold">{d.item.unit}</span>
                              </div>
                              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => setEditingTempId(null)}
                                  className="btn-secondary !px-3 !py-1 text-xs"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(d.tempId, d.item)}
                                  className="btn-primary !px-3 !py-1 text-xs"
                                >
                                  Simpan Perubahan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                              <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                                <p className="text-[11px] text-slate-400 font-medium">Satuan</p>
                                <p className="font-bold text-slate-700 text-xs mt-0.5">{d.item.unit}</p>
                              </div>

                              <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                                <p className="text-[11px] text-slate-400 font-medium">
                                  {type === 'in' ? 'Jumlah Tambah' : 'Jumlah Kurang'}
                                </p>
                                <p className={`font-black text-xs mt-0.5 ${type === 'in' ? 'text-teal-700' : 'text-orange-600'}`}>
                                  {type === 'in' ? '+' : '-'}{formatNumber(d.quantity)} {d.item.unit}
                                </p>
                              </div>

                              <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                                <p className="text-[11px] text-slate-400 font-medium">Stok Saat Ini</p>
                                <p className="font-bold text-slate-700 text-xs mt-0.5">
                                  {formatNumber(d.item.current_stock)} {d.item.unit}
                                </p>
                              </div>

                              <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                                <p className="text-[11px] text-slate-400 font-medium">Estimasi Stok Akhir</p>
                                <p className="font-bold text-slate-800 text-xs mt-0.5">
                                  {formatNumber(estimatedFinalStock)} {d.item.unit}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Final Summary Card & Save Button */}
                <div className="mt-6 pt-5 border-t border-slate-100 space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        📅 Tanggal: <strong>{formatDisplayDate(header.transaction_date)}</strong>
                      </p>
                      <p>
                        👤 Penunjukan: <strong>{header.recipient || '(Belum diisi pada Langkah 1)'}</strong>
                      </p>
                      <p>
                        ✍️ Paraf: <strong>{header.initials || '(Belum diisi)'}</strong>
                      </p>
                    </div>

                    <div className="text-right sm:border-l sm:border-slate-200 sm:pl-4">
                      <p className="text-xs text-slate-400">Total Transaksi</p>
                      <p className="text-lg font-black text-slate-800">
                        {draftItems.length} <span className="text-xs font-normal text-slate-500">jenis barang</span>
                      </p>
                      <p className="text-xs font-bold text-teal-700">
                        ({formatNumber(totalDraftUnits)} unit)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Kosongkan semua barang dari keranjang sementara?')) {
                          setDraftItems([])
                          setExpandedDraftIds(new Set())
                          addToast('info', 'Keranjang Dikosongkan')
                        }
                      }}
                      className="btn-secondary !px-4 w-full sm:w-auto text-xs"
                      title="Kosongkan daftar sementara"
                    >
                      <RotateCcw size={15} />
                      <span>Kosongkan Keranjang</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting || draftItems.length === 0}
                      onClick={handleSaveTransactionGroup}
                      className={`btn-primary w-full sm:w-auto !py-3 !px-6 text-sm font-bold shadow-md hover:shadow-lg transition ${
                        type === 'in' ? '!bg-teal-600 hover:!bg-teal-700' : '!bg-orange-500 hover:!bg-orange-600'
                      }`}
                    >
                      <Download size={18} />
                      {isSubmitting ? 'Menyimpan Seluruh Transaksi...' : `Simpan Transaksi (${draftItems.length} Barang)`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Preview Riwayat Kelompok Transaksi Terkini */}
      <RecentGroupedPreview
        type={type}
        transactions={transactions}
      />
    </div>
  )
}

function RecentGroupedPreview({
  type,
  transactions
}: {
  type: TransactionType
  transactions: Transaction[]
}) {
  const typeTransactions = transactions.filter(t => t.type === type)
  const groups = groupTransactions(typeTransactions).slice(0, 5) // Recent 5 transaction groups
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(
    new Set([groups[0]?.groupId].filter(Boolean))
  )

  const toggleGroup = (id: string) => {
    setOpenGroupIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (groups.length === 0) return null

  return (
    <div className="card p-5 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
        <div>
          <h3 className="section-title">
            Preview Riwayat Kelompok Transaksi ({type === 'in' ? 'Barang Masuk' : 'Barang Keluar'})
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Dikelompokkan berdasarkan tanggal transaksi, penunjukan, dan sesi simpan.
          </p>
        </div>
        <span className="badge bg-slate-100 text-slate-600 text-xs self-start sm:self-auto font-bold">
          {groups.length} Kelompok Transaksi Terakhir
        </span>
      </div>

      <div className="space-y-3">
        {groups.map(group => {
          const isOpen = openGroupIds.has(group.groupId)
          const totalUnits = group.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

          return (
            <div
              key={group.groupId}
              className={`border rounded-xl overflow-hidden transition-all duration-150 ${
                isOpen ? 'border-teal-300 bg-white shadow-xs' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              {/* Group Header Row */}
              <div
                onClick={() => toggleGroup(group.groupId)}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 transition"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <div className={`stat-icon !h-9 !w-9 shrink-0 ${group.type === 'in' ? 'teal' : 'orange'}`}>
                    {group.type === 'in' ? <ArrowDownToLine size={18} /> : <ArrowUpFromLine size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-sm">
                        Barang {group.type === 'in' ? 'Masuk' : 'Keluar'} — {formatDisplayDate(group.date)}
                      </span>
                      <span
                        className={`badge text-[10px] font-bold ${
                          group.type === 'in' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-600'
                        }`}
                      >
                        {group.type === 'in' ? 'Masuk' : 'Keluar'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                      <span>Penunjukan: <strong className="text-slate-700">{group.recipient}</strong></span>
                      <span>Paraf: <strong className="text-slate-700">{group.initials}</strong></span>
                      {group.createdAt && (
                        <span className="text-slate-400">
                          {new Date(group.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                  <div className="text-right">
                    <span className="font-bold text-xs text-teal-700 block">
                      {group.items.length} Jenis Barang
                    </span>
                    <span className="text-[11px] text-slate-400">Total: {formatNumber(totalUnits)} unit</span>
                  </div>

                  <div className="p-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
              </div>

              {/* Accordion Detail Table */}
              {isOpen && (
                <div className="border-t border-slate-200/70 p-4 bg-slate-50/40 overflow-x-auto">
                  <table className="!min-w-[600px]">
                    <thead>
                      <tr>
                        <th>Kode</th>
                        <th>Nama Barang</th>
                        <th className="text-right">Jumlah</th>
                        <th>Satuan</th>
                        <th className="text-right">Sisa Stok</th>
                        <th>Petugas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(tx => (
                        <tr key={tx.id}>
                          <td className="font-mono text-xs text-teal-700 font-bold">{tx.item?.code || '-'}</td>
                          <td className="font-semibold text-slate-700">{tx.item?.name || '-'}</td>
                          <td className={`font-bold text-right ${tx.type === 'in' ? 'text-teal-600' : 'text-orange-600'}`}>
                            {tx.type === 'in' ? '+' : '-'}{formatNumber(tx.quantity)}
                          </td>
                          <td className="text-slate-500">{tx.item?.unit || 'Buah'}</td>
                          <td className="text-right font-medium">{formatNumber(tx.balance_after)}</td>
                          <td className="text-xs text-slate-500">{tx.officer_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function History({ transactions }: { transactions: Transaction[] }) {
  const [query, setQuery] = useState('')
  const today = localDateString(new Date())
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`)
  const [endDate, setEndDate] = useState(today)
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all')
  const filtered = transactions.filter(t => {
    const matchesQuery = `${t.item?.code} ${t.item?.name} ${t.recipient || ''} ${t.source || ''}`.toLowerCase().includes(query.toLowerCase())
    const matchesDate = t.transaction_date >= startDate && t.transaction_date <= endDate
    const matchesType = typeFilter === 'all' || t.type === typeFilter
    return matchesQuery && matchesDate && matchesType
  })
  return (
    <>
      <div className="mb-6">
        <p className="eyebrow">AKTIVITAS</p>
        <h1 className="title">Riwayat Transaksi</h1>
        <p className="subtitle">Semua pergerakan stok tercatat secara permanen.</p>
      </div>
      <div className="card p-4 mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
        <div className="search">
          <Search size={17} />
          <input placeholder="Cari transaksi..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <label>Dari<DateField value={startDate} onChange={setStartDate} /></label>
        <label>Sampai<DateField value={endDate} onChange={setEndDate} /></label>
        <label>Jenis
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | TransactionType)}>
            <option value="all">Semua jenis</option>
            <option value="in">Barang masuk</option>
            <option value="out">Barang keluar</option>
          </select>
        </label>
      </div>
      <div className="card p-5 overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jenis</th>
              <th>Barang</th>
              <th>Penerima / sumber</th>
              <th>Tambah</th>
              <th>Kurang</th>
              <th>Sisa stok</th>
              <th>Petugas</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map(t => (
                <tr key={t.id}>
                  <td>{formatDate(t.transaction_date)}</td>
                  <td>
                    <span className={`badge ${t.type === 'in' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-600'}`}>
                      {t.type === 'in' ? 'Masuk' : 'Keluar'}
                    </span>
                  </td>
                  <td>
                    <b>{t.item?.code}</b><br />
                    <span className="text-xs text-slate-400">{t.item?.name}</span>
                  </td>
                  <td>{t.recipient || t.source || '-'}</td>
                  <td className="font-semibold">{t.type === 'in' ? formatNumber(t.quantity) : '-'}</td>
                  <td className="font-semibold">{t.type === 'out' ? formatNumber(t.quantity) : '-'}</td>
                  <td>{formatNumber(t.balance_after)}</td>
                  <td>{t.officer_name}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400">
                  Belum ada transaksi tersimpan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Reports({ items, transactions }: { items: Item[]; transactions: Transaction[] }) {
  const today = localDateString(new Date())
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`)
  const [endDate, setEndDate] = useState(today)
  const [itemId, setItemId] = useState('all')
  const [transactionFilter, setTransactionFilter] = useState<'all' | TransactionType>('all')
  const quantity = (value: number | string | null | undefined) => Number(value) || 0

  const selectedItems = itemId === 'all'
    ? items
    : items.filter(item => item.id === itemId)

  const getRows = () => selectedItems.map(item => {
    const before = transactions.filter(t => t.item_id === item.id && t.transaction_date < startDate)
    const opening = before.reduce((balance, t) => balance + (t.type === 'in' ? quantity(t.quantity) : -quantity(t.quantity)), quantity(item.opening_stock))
    const period = transactions.filter(t => t.item_id === item.id && t.transaction_date >= startDate && t.transaction_date <= endDate && (transactionFilter === 'all' || t.type === transactionFilter))
    const add = period.filter(t => t.type === 'in').reduce((total, t) => total + quantity(t.quantity), 0)
    const subtract = period.filter(t => t.type === 'out').reduce((total, t) => total + quantity(t.quantity), 0)
    return { item, add, subtract, balance: opening + add - subtract }
  })

  const rows = getRows()

  const exportExcel = () => {
    if (startDate > endDate) return alert('Tanggal mulai tidak boleh setelah tanggal akhir.')
    const data = [
      ['Indeks', 'Satuan', 'Nama Barang', 'Tambah', 'Kurang', 'Sisa'],
      ...rows.map(row => [
        row.item.code,
        row.item.unit,
        row.item.name,
        row.add ? Math.round(row.add) : '',
        row.subtract ? Math.round(row.subtract) : '',
        Math.round(row.balance)
      ])
    ]
    const sheet = XLSX.utils.aoa_to_sheet(data)
    sheet['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Buku Persediaan')
    try {
      const workbook = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `buku-persediaan-${startDate}-${endDate}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Gagal mengunduh laporan Excel', error)
      alert('Laporan gagal diunduh. Periksa izin unduhan browser lalu coba lagi.')
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="eyebrow">LAPORAN INVENTARIS</p>
        <h1 className="title">Buku Persediaan ATK</h1>
        <p className="subtitle">Pilih periode, barang, dan jenis transaksi, lalu export laporan dalam format buku persediaan fisik.</p>
      </div>
      <div className="card p-5 mb-6">
        <div className="grid gap-4 md:grid-cols-4 md:items-end">
          <label>Tanggal mulai<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
          <label>Tanggal akhir<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
          <label>Barang
            <select value={itemId} onChange={e => setItemId(e.target.value)}>
              <option value="all">Semua barang</option>
              {items.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
            </select>
          </label>
          <label>Jenis transaksi
            <select value={transactionFilter} onChange={e => setTransactionFilter(e.target.value as 'all' | TransactionType)}>
              <option value="all">Semua transaksi</option>
              <option value="in">Barang masuk</option>
              <option value="out">Barang keluar</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={exportExcel}>
            <FileSpreadsheet size={16} />Export Excel
          </button>
        </div>
      </div>
      <div className="card p-5 overflow-x-auto">
        <div className="mb-4">
          <h3 className="section-title">Rekap buku persediaan</h3>
          <p className="text-xs text-slate-400 mt-1">Setiap barang hanya ditampilkan satu kali. Tambah dan kurang mengikuti filter jenis transaksi dan periode terpilih.</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Indeks</th>
              <th>Satuan</th>
              <th>Nama Barang</th>
              <th>Tambah</th>
              <th>Kurang</th>
              <th>Sisa</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(row => (
                <tr key={row.item.id}>
                  <td className="font-mono text-xs text-teal-700">{row.item.code}</td>
                  <td>{row.item.unit}</td>
                  <td className="font-semibold text-slate-700">{row.item.name}</td>
                  <td>{row.add ? formatNumber(row.add) : '-'}</td>
                  <td>{row.subtract ? formatNumber(row.subtract) : '-'}</td>
                  <td className="font-semibold">{formatNumber(row.balance)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-400">Belum ada data untuk pilihan laporan.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={close}><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
