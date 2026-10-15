# ATK Insight

Sistem informasi inventaris alat tulis kantor berbasis React, TypeScript, Vite, Tailwind CSS, Supabase, Recharts, dan SheetJS.

## Menjalankan lokal

1. Pastikan Node.js 20+ dan npm tersedia.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env.local`, lalu isi URL project Supabase dan **anon key** (bukan service-role key).
4. Buka SQL Editor Supabase dan jalankan [`supabase/schema.sql`](./supabase/schema.sql).
5. Buat akun admin dari Supabase Dashboard (Authentication > Users). Tidak ada registrasi publik.
6. Jalankan `npm run dev`.

Jika environment Supabase belum diisi, aplikasi tetap dapat dibuka dalam mode pratinjau lokal menggunakan data contoh; operasi yang tersimpan ke database aktif setelah environment dikonfigurasi.

## Deployment Vercel

Import repository/folder ini ke Vercel, gunakan preset Vite, dan tambahkan `VITE_SUPABASE_URL` serta `VITE_SUPABASE_ANON_KEY` pada Environment Variables. `vercel.json` sudah menyediakan fallback routing untuk aplikasi SPA.

## Catatan keamanan

Transaksi stok tidak mengubah `items.current_stock` dari browser secara langsung. RPC `record_stock_transaction` mengunci baris item (`FOR UPDATE`), memvalidasi stok, memperbarui saldo, mencatat transaksi, dan menulis audit log dalam satu transaksi database. RLS pada seluruh tabel admin membatasi akses ke pengguna terautentikasi dengan profil admin.
# invenpos
