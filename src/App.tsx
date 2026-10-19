import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import type { Item, Page, Transaction, TransactionType } from './types'
import { Archive, ArrowDownToLine, ArrowUpFromLine, Boxes, Download, FileSpreadsheet, LayoutDashboard, LogOut, Menu, Moon, Package, Pencil, Plus, Search, Sun, Trash2, UserRound, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import logo from './logo.png'

const SESSION_DURATION_MS = 30 * 60 * 1000
const SESSION_STARTED_AT_KEY = 'atk-session-started-at'
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }, { id: 'items', label: 'Data Barang', icon: Boxes },
  { id: 'transactions', label: 'Transaksi Stok', icon: ArrowDownToLine },
  { id: 'history', label: 'Riwayat Transaksi', icon: Archive }, { id: 'reports', label: 'Laporan Excel', icon: FileSpreadsheet },
]
const formatNumber = (n: number | string | null | undefined) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(n) || 0)
const formatDate = (s: string) => {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}
const localDateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const displayDate = (value: string) => {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : ''
}
const parseDisplayDate = (value: string) => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null
}
function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [displayValue, setDisplayValue] = useState(() => displayDate(value))
  useEffect(() => setDisplayValue(displayDate(value)), [value])
  return <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={displayValue} onChange={e => {
    const nextValue = e.target.value.replace(/[^\d/]/g, '').slice(0, 10)
    setDisplayValue(nextValue)
    const parsed = parseDisplayDate(nextValue)
    if (parsed) onChange(parsed)
  }} />
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

  if (!isSupabaseConfigured) return <Login configurationError />
  if (!session) return <Login />
  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">Memuat data inventaris...</div>
  const logout = () => {
    localStorage.removeItem(SESSION_STARTED_AT_KEY)
    void supabase.auth.signOut()
  }
  return <div className="app-shell min-h-screen text-slate-800">
    <Sidebar page={page} setPage={setPage} open={sidebar} close={() => setSidebar(false)} onLogout={logout} />
    <main className="lg:pl-64">
      <header className="app-header h-16 border-b px-5 md:px-8 flex items-center justify-between sticky top-0 z-20">
        <button className="lg:hidden p-2 rounded-lg hover:bg-slate-100" onClick={() => setSidebar(true)}><Menu size={22} /></button>
        <div className="hidden lg:block"><p className="text-sm text-slate-400">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}</p></div>
        <div className="flex items-center gap-3 ml-auto"><button className="theme-toggle" aria-label="Ubah tema" onClick={() => setDarkMode(v => !v)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><div className="text-right hidden sm:block"><p className="text-sm font-semibold">Admin Inventaris</p><p className="text-xs text-slate-400">Administrator</p></div><div className="h-9 w-9 rounded-full bg-teal-100 text-teal-700 grid place-items-center"><UserRound size={17} /></div></div>
      </header>
      <div className="p-5 md:p-8 max-w-[1600px] mx-auto">{page === 'dashboard' && <Dashboard items={items} transactions={transactions} onOpenStockEntry={item => { setTransactionItemId(item.id); setPage('transactions') }} />}{page === 'items' && <Items items={items} transactions={transactions} setItems={setItems} />}{page === 'transactions' && <TransactionsPage items={items} setItems={setItems} setTransactions={setTransactions} initialItemId={transactionItemId} />}{page === 'history' && <History transactions={transactions} />}{page === 'reports' && <Reports items={items} transactions={transactions} />}</div>
    </main>
  </div>
}

function Login({ configurationError = false }: { configurationError?: boolean }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    if (configurationError) {
      setError('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY terlebih dahulu.')
      setBusy(false)
      return
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) setError('Email atau kata sandi salah.')
    setBusy(false)
  }
  return <div className="min-h-screen bg-[#f2f8f7] grid lg:grid-cols-2"><div className="hidden lg:flex bg-teal-700 p-16 text-white flex-col justify-between relative overflow-hidden"><div><div className="flex items-center gap-3 text-2xl font-bold"><img src={logo} alt="Logo Inventaris Rekap" className="h-12 w-12 rounded-lg object-contain bg-white p-1" /> INVENTARIS REKAP</div><h1 className="text-5xl font-bold leading-tight mt-28 max-w-lg">Kelola inventaris kantor dengan lebih teratur.</h1><p className="text-teal-100 mt-6 max-w-md text-lg">Pantau stok, catat transaksi, dan buat laporan dengan mudah dari satu tempat.</p></div><p className="text-teal-200 text-sm">Sistem Informasi Inventaris ATK • KCU KARAWANG</p><div className="absolute -right-24 -bottom-24 h-80 w-80 border-[40px] border-white/10 rounded-full" /></div><div className="grid place-items-center p-6"><form onSubmit={submit} className="bg-white rounded-2xl shadow-soft p-8 w-full max-w-md"><div className="mb-8"><img src={logo} alt="Logo Inventaris Rekap" className="h-12 w-12 rounded-xl object-contain mb-5" /><h2 className="text-2xl font-bold text-ink">Selamat datang kembali</h2><p className="text-slate-500 mt-2">Masuk ke panel admin inventaris Anda.</p></div><label>Email admin<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email admin" /></label><label className="mt-4">Kata sandi<input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Masukkan kata sandi" /></label>{error && <p className="text-sm text-red-600 mt-3">{error}</p>}<button className="btn-primary w-full mt-7" disabled={busy || configurationError}>{configurationError ? 'Supabase belum dikonfigurasi' : busy ? 'Memproses...' : 'Masuk ke Dashboard'}</button><p className="text-center text-xs text-slate-400 mt-4">Akses terbatas untuk administrator terdaftar.</p></form></div></div>
}

function Sidebar({ page, setPage, open, close, onLogout }: { page: Page; setPage: (p: Page) => void; open: boolean; close: () => void; onLogout: () => void }) {
  return <><div className={`fixed inset-0 bg-slate-900/30 z-30 lg:hidden ${open ? '' : 'hidden'}`} onClick={close} /><aside className={`fixed z-40 inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}><div className="h-20 px-7 flex items-center gap-3 border-b border-slate-100"><img src={logo} alt="Logo Inventaris Rekap" className="h-9 w-9 rounded-lg object-contain" /><div><p className="font-extrabold text-ink">INVENTARIS <span className="text-teal-600">REKAP</span></p><p className="text-[10px] text-slate-400 tracking-wider">KCU KARAWANG</p></div><button className="ml-auto lg:hidden" onClick={close}><X size={20} /></button></div><nav className="p-4 space-y-1 flex-1">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setPage(id); close() }} className={`nav-item ${page === id ? 'active' : ''}`}><Icon size={19} />{label}</button>)}</nav><div className="m-4 p-4 bg-teal-50 rounded-xl"><p className="text-xs font-semibold text-teal-800">Status Sistem</p><div className="flex items-center gap-2 mt-2 text-xs text-teal-700"><span className="h-2 w-2 rounded-full bg-teal-500" /> Database terhubung</div></div><button className="m-4 mt-0 nav-item text-slate-500" onClick={onLogout}><LogOut size={18} />Keluar</button></aside></>
}

function Dashboard({ items, transactions, onOpenStockEntry }: { items: Item[]; transactions: Transaction[]; onOpenStockEntry: (item: Item) => void }) {
  const total = items.reduce((a, i) => a + Math.round(Number(i.current_stock || 0)), 0); const low = items.filter(i => Number(i.current_stock) > 0 && Number(i.current_stock) <= (Number(i.minimum_stock) || 5)).length; const empty = items.filter(i => Number(i.current_stock) === 0).length
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
  const stats = [{ label: 'Jenis Barang', value: items.length, sub: 'Total item terdaftar', icon: Boxes, color: 'blue' }, { label: 'Total Stok Tersedia', value: formatNumber(total), sub: 'Stok aktual saat ini', icon: Package, color: 'teal' }, { label: 'Barang Masuk', value: formatNumber(Math.round(totalIn)), sub: `Transaksi bulan ${months[selectedMonth - 1]}`, icon: ArrowDownToLine, color: 'violet' }, { label: 'Barang Keluar', value: formatNumber(Math.round(totalOut)), sub: `Transaksi bulan ${months[selectedMonth - 1]}`, icon: ArrowUpFromLine, color: 'orange' }]
  const activity = months.map((month, i) => { const monthIndex = i + 1; const entries = transactions.filter(t => Number(t.transaction_date.slice(0, 4)) === selectedYear && Number(t.transaction_date.slice(5, 7)) === monthIndex); return { month, monthIndex, masuk: Math.round(entries.filter(t => t.type === 'in').reduce((n, t) => n + Number(t.quantity || 0), 0)), keluar: Math.round(entries.filter(t => t.type === 'out').reduce((n, t) => n + Number(t.quantity || 0), 0)) } })
  const selectMonth = (monthIndex: number) => setSelectedMonth(monthIndex)
  const statusItems = items.filter(item => statusFilter === 'safe' ? Number(item.current_stock) > (Number(item.minimum_stock) || 5) : statusFilter === 'low' ? Number(item.current_stock) > 0 && Number(item.current_stock) <= (Number(item.minimum_stock) || 5) : statusFilter === 'empty' ? Number(item.current_stock) === 0 : true)
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
  return <><div className="mb-7"><p className="eyebrow">RINGKASAN INVENTARIS</p><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><h1 className="title">Dashboard Inventaris</h1><p className="subtitle">Ringkasan kondisi stok dan transaksi kantor.</p></div><div className="grid w-full grid-cols-2 gap-3 md:w-auto"><label className="md:w-32">Tahun<select aria-label="Filter tahun dashboard" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label><label className="md:w-32">Bulan<select aria-label="Filter bulan dashboard" value={selectedMonth} onChange={e => selectMonth(Number(e.target.value))}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></div></div></div><div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">{stats.map(({ label, value, sub, icon: Icon, color }) => <div className="card p-5" key={label}><div className="flex justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold text-ink mt-2">{value}</p></div><div className={`stat-icon ${color}`}><Icon size={20} /></div></div><p className="text-xs text-slate-400 mt-4">{sub}</p></div>)}</div><div className="grid xl:grid-cols-3 gap-6"><div className="card p-5 xl:col-span-2"><div className="flex justify-between items-center mb-5"><div><h3 className="section-title">Aktivitas transaksi</h3><p className="text-xs text-slate-400 mt-1">Klik batang grafik untuk memilih bulan</p></div><span className="badge bg-teal-50 text-teal-700">{months[selectedMonth - 1]} {selectedYear}</span></div><ResponsiveContainer width="100%" height={265}><BarChart data={activity} barGap={6} onClick={state => { const monthIndex = state?.activePayload?.[0]?.payload?.monthIndex; if (typeof monthIndex === 'number') selectMonth(monthIndex) }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tickFormatter={value => formatNumber(value)} tick={{ fontSize: 12, fill: '#94a3b8' }} /><Tooltip formatter={value => formatNumber(Number(value))} /><Bar dataKey="masuk" name="Barang masuk" fill="#1f4e85" radius={[4, 4, 0, 0]} cursor="pointer" onClick={entry => selectMonth(entry.monthIndex)} /><Bar dataKey="keluar" name="Barang keluar" fill="#94a3b8" radius={[4, 4, 0, 0]} cursor="pointer" onClick={entry => selectMonth(entry.monthIndex)} /></BarChart></ResponsiveContainer></div><div className="card p-5"><h3 className="section-title">Status stok</h3><p className="text-xs text-slate-400 mt-1">Klik status untuk memfilter daftar di bawah</p><div className="flex items-center justify-center my-3"><div className="relative w-40 h-40"><ResponsiveContainer><PieChart><Pie data={[{ name: 'Aman', value: items.length - low - empty }, { name: 'Menipis', value: low }, { name: 'Habis', value: empty }]} innerRadius={52} outerRadius={70} dataKey="value" stroke="none"><Cell fill="#1f4e85" cursor="pointer" onClick={() => setStatusFilter('safe')} /><Cell fill="#f59e0b" cursor="pointer" onClick={() => setStatusFilter('low')} /><Cell fill="#ef4444" cursor="pointer" onClick={() => setStatusFilter('empty')} /></Pie></PieChart></ResponsiveContainer><div className="absolute inset-0 grid place-items-center"><span className="text-2xl font-bold">{items.length}</span></div></div></div><div className="space-y-3">{[['Aman', items.length - low - empty, 'bg-teal-500', 'safe'], ['Stok menipis', low, 'bg-amber-500', 'low'], ['Stok habis', empty, 'bg-red-500', 'empty']].map(([x, n, c, filter]) => <button className={`flex w-full justify-between text-sm rounded-md px-2 py-1 transition hover:bg-slate-50 ${statusFilter === filter ? 'bg-slate-50 ring-1 ring-teal-200' : ''}`} key={x as string} onClick={() => setStatusFilter(filter as 'safe' | 'low' | 'empty')}><span className="flex items-center gap-2"><i className={`h-2 w-2 rounded-full ${c}`} />{x}</span><b>{n}</b></button>)}</div></div></div><div className="card mt-6 p-5"><div className="flex justify-between items-center mb-4"><div><h3 className="section-title">Stok perlu diperhatikan</h3><p className="text-xs text-slate-400 mt-1">Filter aktif: {statusLabel} • Klik nama barang untuk mencatat barang masuk</p></div>{statusFilter !== 'all' && <button className="btn-secondary !px-3 !py-2 text-xs" onClick={() => { setStatusFilter('all'); setStockPage(1) }}>Tampilkan semua</button>}</div><ItemTable items={visibleStatusItems} onItemClick={onOpenStockEntry} />{statusFilter !== 'all' && stockPageCount > 1 && <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-400">Halaman {stockPage} dari {stockPageCount}</p><div className="flex gap-2"><button className="btn-secondary !px-3 !py-2 text-xs" disabled={stockPage === 1} onClick={() => setStockPage(page => page - 1)}>Sebelumnya</button><button className="btn-secondary !px-3 !py-2 text-xs" disabled={stockPage === stockPageCount} onClick={() => setStockPage(page => page + 1)}>Berikutnya</button></div></div>}</div></>
}

function ItemTable({ items, actions, onItemClick }: { items: Item[]; actions?: (item: Item) => React.ReactNode; onItemClick?: (item: Item) => void }) { return <div className="overflow-x-auto"><table><thead><tr><th>Kode</th><th>Nama barang</th><th>Kategori</th><th>Stok tersedia</th><th>Status</th>{actions && <th>Aksi</th>}</tr></thead><tbody>{items.map(i => <tr key={i.id} className={onItemClick ? 'cursor-pointer hover:bg-slate-50' : ''} onClick={() => onItemClick?.(i)}>{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}<td className="font-mono text-xs text-teal-700">{i.code}</td><td className="font-semibold text-slate-700">{i.name}</td><td>{i.category}</td><td className="font-semibold">{formatNumber(i.current_stock)} <span className="font-normal text-slate-400">{i.unit}</span></td><td><span className={`badge ${Number(i.current_stock) === 0 ? 'bg-red-50 text-red-600' : Number(i.current_stock) <= (Number(i.minimum_stock) || 5) ? 'bg-amber-50 text-amber-600' : 'bg-teal-50 text-teal-700'}`}>{Number(i.current_stock) === 0 ? 'Habis' : Number(i.current_stock) <= (Number(i.minimum_stock) || 5) ? 'Menipis' : 'Aman'}</span></td>{actions && <td>{actions(i)}</td>}</tr>)}</tbody></table></div> }

function Items({ items, transactions, setItems }: { items: Item[]; transactions: Transaction[]; setItems: React.Dispatch<React.SetStateAction<Item[]>> }) {
  const emptyForm = { code: '', name: '', unit: 'Buah', opening_stock: 0, minimum_stock: 5 }
  const [query, setQuery] = useState(''); const [show, setShow] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(emptyForm)
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
    if (transactions.some(transaction => transaction.item_id === item.id)) return alert('Barang tidak dapat dihapus karena sudah memiliki transaksi. Gunakan update jika masih diperlukan.')
    if (!window.confirm(`Hapus barang "${item.name}"?`)) return
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) return alert(error.message)
    setItems(v => v.filter(current => current.id !== item.id))
  }
  return <><div className="flex flex-col md:flex-row md:items-end justify-between mb-6"><div><p className="eyebrow">MASTER DATA</p><h1 className="title">Data Barang</h1><p className="subtitle">Kelola data dasar barang ATK.</p></div><button className="btn-primary mt-4 md:mt-0" onClick={openCreate}><Plus size={17} />Tambah Barang</button></div><div className="card p-4 mb-5"><div className="search"><Search size={17} /><input placeholder="Cari kode atau nama barang..." value={query} onChange={e => setQuery(e.target.value)} /></div></div><div className="card p-5"><h3 className="section-title mb-4">Daftar barang <span className="text-slate-400 font-normal text-sm">({filtered.length} item)</span></h3><ItemTable items={filtered} actions={item => <div className="flex gap-2"><button className="btn-secondary !px-3 !py-2" title="Update barang" onClick={() => openEdit(item)}><Pencil size={14} /></button><button className="btn-secondary !px-3 !py-2 text-red-600" title="Hapus barang" onClick={() => remove(item)}><Trash2 size={14} /></button></div>} /></div>{show && <Modal title={editing ? 'Update barang' : 'Tambah barang baru'} close={() => setShow(false)}><form onSubmit={save} className="space-y-4"><label>Indeks / kode barang<input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="ATK-006" /></label><label>Nama barang<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Satuan<select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}><option>Buah</option><option>PCS</option><option>Lembar</option><option>Ikat</option><option>Lusin</option><option>Rim</option><option>Kotak</option><option>Pak</option><option>Botol</option></select></label>{!editing && <label>Stok awal<input type="number" min="0" required value={form.opening_stock} onChange={e => setForm({ ...form, opening_stock: Number(e.target.value) })} /></label>}<label>Stok minimum<input type="number" min="0" required value={form.minimum_stock} onChange={e => setForm({ ...form, minimum_stock: Number(e.target.value) })} /></label><div className="flex justify-end gap-2 mt-2"><button type="button" className="btn-secondary" onClick={() => setShow(false)}>Batal</button><button className="btn-primary">{editing ? 'Update barang' : 'Simpan barang'}</button></div></form></Modal>}</>
}

function TransactionsPage({ items, setItems, setTransactions, initialItemId }: { items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>>; setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>; initialItemId: string | null }) {
  return <><div className="mb-6"><p className="eyebrow">TRANSAKSI STOK</p><h1 className="title">Barang Masuk dan Barang Keluar</h1><p className="subtitle">Catat penambahan dan pengurangan stok pada satu halaman.</p></div><div className="grid gap-6 xl:grid-cols-2 items-start"><TransactionForm type="in" items={items} setItems={setItems} setTransactions={setTransactions} initialItemId={initialItemId} /><TransactionForm type="out" items={items} setItems={setItems} setTransactions={setTransactions} /></div></>
}

function TransactionForm({ type, items, setItems, setTransactions, initialItemId = null }: { type: TransactionType; items: Item[]; setItems: React.Dispatch<React.SetStateAction<Item[]>>; setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>; initialItemId?: string | null }) {
  const initialItem = initialItemId ? items.find(i => i.id === initialItemId) : undefined
  const [form, setForm] = useState({ transaction_date: localDateString(new Date()), item_id: initialItem?.id || '', quantity: 0, initials: '', recipient: '' })
  const [itemQuery, setItemQuery] = useState(initialItem ? `${initialItem.code} — ${initialItem.name}` : '')
  useEffect(() => {
    if (type !== 'in' || !initialItemId) return
    const selected = items.find(i => i.id === initialItemId)
    if (selected) {
      setForm(v => ({ ...v, item_id: selected.id }))
      setItemQuery(`${selected.code} — ${selected.name}`)
    }
  }, [initialItemId, items, type])
  const item = items.find(i => i.id === form.item_id)
  const update = (key: string, value: string | number) => setForm(v => ({ ...v, [key]: value }))
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item) return alert('Pilih barang terlebih dahulu.')
    if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0) return alert('Jumlah transaksi harus berupa bilangan bulat lebih besar dari nol.')
    if (type === 'out' && Number(form.quantity) > item.current_stock) return alert('Stok tidak mencukupi untuk transaksi ini.')
    const balance = type === 'in' ? item.current_stock + Number(form.quantity) : item.current_stock - Number(form.quantity)
    const { data, error } = await supabase.rpc('record_stock_transaction', { p_item_id: item.id, p_type: type, p_quantity: Number(form.quantity), p_date: form.transaction_date, p_officer: 'Admin Inventaris', p_initials: form.initials || null, p_recipient: form.recipient || null })
    if (error) return alert(error.message)
    if (data) setTransactions(v => [data as Transaction, ...v])
    setItems(v => v.map(i => i.id === item.id ? { ...i, current_stock: balance } : i))
    alert('Transaksi berhasil disimpan dan stok diperbarui.')
    setForm(v => ({ ...v, item_id: '', quantity: 0, recipient: '', initials: '' }))
    setItemQuery('')
  }
  return <section className={`card p-5 border-t-4 ${type === 'in' ? 'border-t-teal-600' : 'border-t-orange-500'}`}><div className="mb-5 flex items-center gap-3"><div className={`stat-icon ${type === 'in' ? 'teal' : 'orange'}`}>{type === 'in' ? <ArrowDownToLine size={20} /> : <ArrowUpFromLine size={20} />}</div><div><h2 className="section-title">Barang {type === 'in' ? 'Masuk' : 'Keluar'}</h2><p className="text-xs text-slate-400 mt-1">{type === 'in' ? 'Tambah stok barang' : 'Kurangi stok barang'}</p></div></div><form onSubmit={save} className="space-y-4"><label>Tanggal<input type="date" required value={form.transaction_date} onChange={e => update('transaction_date', e.target.value)} /></label><label>Nama barang<input list={`items-${type}`} required value={itemQuery} onChange={e => { const value = e.target.value; setItemQuery(value); const selected = items.find(i => `${i.code} — ${i.name}` === value); update('item_id', selected?.id || '') }} placeholder={items.length ? 'Ketik atau pilih barang' : 'Belum ada data barang'} /><datalist id={`items-${type}`}>{items.map(i => <option key={i.id} value={`${i.code} — ${i.name}`} />)}</datalist></label><label>Satuan<input readOnly value={item?.unit || 'Otomatis terisi'} /></label>{type === 'out' && <label>Penunjukan / nama orang yang meminta barang<input required value={form.recipient} onChange={e => update('recipient', e.target.value)} /></label>}<label>{type === 'in' ? 'Jumlah tambah' : 'Jumlah kurang'}<input type="number" min="1" step="1" required value={form.quantity} onChange={e => update('quantity', Number(e.target.value))} /></label><label>Paraf<input required value={form.initials} onChange={e => update('initials', e.target.value)} /></label><div className="flex justify-end pt-2"><button className="btn-primary"><Download size={16} />Simpan {type === 'in' ? 'barang masuk' : 'barang keluar'}</button></div></form></section>
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
  return <><div className="mb-6"><p className="eyebrow">AKTIVITAS</p><h1 className="title">Riwayat Transaksi</h1><p className="subtitle">Semua pergerakan stok tercatat secara permanen.</p></div><div className="card p-4 mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end"><div className="search"><Search size={17} /><input placeholder="Cari transaksi..." value={query} onChange={e => setQuery(e.target.value)} /></div><label>Dari<DateField value={startDate} onChange={setStartDate} /></label><label>Sampai<DateField value={endDate} onChange={setEndDate} /></label><label>Jenis<select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | TransactionType)}><option value="all">Semua jenis</option><option value="in">Barang masuk</option><option value="out">Barang keluar</option></select></label></div><div className="card p-5 overflow-x-auto"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Barang</th><th>Penerima / sumber</th><th>Tambah</th><th>Kurang</th><th>Sisa stok</th><th>Petugas</th></tr></thead><tbody>{filtered.length ? filtered.map(t => <tr key={t.id}><td>{formatDate(t.transaction_date)}</td><td><span className={`badge ${t.type === 'in' ? 'bg-teal-50 text-teal-700' : 'bg-orange-50 text-orange-600'}`}>{t.type === 'in' ? 'Masuk' : 'Keluar'}</span></td><td><b>{t.item?.code}</b><br /><span className="text-xs text-slate-400">{t.item?.name}</span></td><td>{t.recipient || t.source || '-'}</td><td className="font-semibold">{t.type === 'in' ? formatNumber(t.quantity) : '-'}</td><td className="font-semibold">{t.type === 'out' ? formatNumber(t.quantity) : '-'}</td><td>{formatNumber(t.balance_after)}</td><td>{t.officer_name}</td></tr>) : <tr><td colSpan={8} className="text-center py-10 text-slate-400">Belum ada transaksi tersimpan.</td></tr>}</tbody></table></div></>
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
    const data = [['Indeks', 'Satuan', 'Nama Barang', 'Tambah', 'Kurang', 'Sisa'], ...rows.map(row => [row.item.code, row.item.unit, row.item.name, row.add ? Math.round(row.add) : '', row.subtract ? Math.round(row.subtract) : '', Math.round(row.balance)])]
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
  return <><div className="mb-6"><p className="eyebrow">LAPORAN INVENTARIS</p><h1 className="title">Buku Persediaan ATK</h1><p className="subtitle">Pilih periode, barang, dan jenis transaksi, lalu export laporan dalam format buku persediaan fisik.</p></div><div className="card p-5 mb-6"><div className="grid gap-4 md:grid-cols-4 md:items-end"><label>Tanggal mulai<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label>Tanggal akhir<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label><label>Barang<select value={itemId} onChange={e => setItemId(e.target.value)}><option value="all">Semua barang</option>{items.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label>Jenis transaksi<select value={transactionFilter} onChange={e => setTransactionFilter(e.target.value as 'all' | TransactionType)}><option value="all">Semua transaksi</option><option value="in">Barang masuk</option><option value="out">Barang keluar</option></select></label></div><div className="mt-5 flex justify-end"><button className="btn-primary" onClick={exportExcel}><FileSpreadsheet size={16} />Export Excel</button></div></div><div className="card p-5 overflow-x-auto"><div className="mb-4"><h3 className="section-title">Rekap buku persediaan</h3><p className="text-xs text-slate-400 mt-1">Setiap barang hanya ditampilkan satu kali. Tambah dan kurang mengikuti filter jenis transaksi dan periode terpilih.</p></div><table><thead><tr><th>Indeks</th><th>Satuan</th><th>Nama Barang</th><th>Tambah</th><th>Kurang</th><th>Sisa</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.item.id}><td className="font-mono text-xs text-teal-700">{row.item.code}</td><td>{row.item.unit}</td><td className="font-semibold text-slate-700">{row.item.name}</td><td>{row.add ? formatNumber(row.add) : '-'}</td><td>{row.subtract ? formatNumber(row.subtract) : '-'}</td><td className="font-semibold">{formatNumber(row.balance)}</td></tr>) : <tr><td colSpan={6} className="py-10 text-center text-slate-400">Belum ada data untuk pilihan laporan.</td></tr>}</tbody></table></div></>
}

function ReportPreview({ kind, items, transactions, close, download }: { kind: string; items: Item[]; transactions: Transaction[]; close: () => void; download: (kind: string) => void }) {
  const titles: Record<string, string> = { persediaan: 'Laporan Persediaan Seluruh Barang', 'kartu-stok': 'Kartu Stok Barang', masuk: 'Laporan Barang Masuk', keluar: 'Laporan Barang Keluar' }
  const filtered = transactions.filter(t => kind === 'masuk' ? t.type === 'in' : kind === 'keluar' ? t.type === 'out' : true)
  return <div className="fixed inset-0 z-50 bg-slate-900/40 p-4 md:p-8"><div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b p-5"><div><p className="eyebrow">PRATINJAU LAPORAN</p><h2 className="text-xl font-bold text-ink">{titles[kind]}</h2><p className="text-sm text-slate-400 mt-1">Data aktual • {new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())}</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={close}><X size={16} />Tutup</button><button className="btn-primary" onClick={() => download(kind)}><Download size={16} />Unduh Excel</button></div></div><div className="flex-1 overflow-auto p-5"><div className="mb-5 rounded-lg border border-slate-200 p-4"><p className="text-sm font-semibold">INVENTARIS REKAP — Sistem Informasi Inventaris</p><p className="text-xs text-slate-500 mt-1">Periode laporan: Semua data tercatat</p></div>{kind === 'persediaan' ? <ItemTable items={items} /> : <table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kode</th><th>Nama barang</th><th>Tambah</th><th>Kurang</th><th>Sisa</th><th>Uraian</th><th>Paraf</th></tr></thead><tbody>{filtered.length ? filtered.map(t => <tr key={t.id}><td>{formatDate(t.transaction_date)}</td><td>{t.type === 'in' ? 'Masuk' : 'Keluar'}</td><td>{t.item?.code || '-'}</td><td>{t.item?.name || '-'}</td><td>{t.type === 'in' ? formatNumber(t.quantity) : '-'}</td><td>{t.type === 'out' ? formatNumber(t.quantity) : '-'}</td><td>{formatNumber(t.balance_after)}</td><td>{t.recipient || t.source || '-'}</td><td>{t.initials || '-'}</td></tr>) : <tr><td colSpan={9} className="py-10 text-center text-slate-400">Belum ada transaksi untuk laporan ini.</td></tr>}</tbody></table>}</div><div className="border-t p-4 text-right text-xs text-slate-400">Dokumen ini dibuat dari data inventaris aplikasi.</div></div></div>
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4"><div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"><div className="flex justify-between items-center p-6 border-b"><h2 className="text-lg font-bold">{title}</h2><button onClick={close}><X size={20} /></button></div><div className="p-6">{children}</div></div></div> }
