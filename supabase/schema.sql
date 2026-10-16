create extension if not exists "uuid-ossp";
create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text not null, role text not null default 'admin' check (role = 'admin'), created_at timestamptz not null default now());
create table if not exists public.categories (id uuid primary key default uuid_generate_v4(), name text unique not null, created_at timestamptz not null default now());
create table if not exists public.items (id uuid primary key default uuid_generate_v4(), code text unique not null, name text not null, category_id uuid references public.categories(id), category text not null, unit text not null, opening_stock numeric(14,2) not null default 0 check (opening_stock >= 0), current_stock numeric(14,2) not null default 0 check (current_stock >= 0), minimum_stock numeric(14,2) not null default 0 check (minimum_stock >= 0), description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
do $$ begin
  create type transaction_type as enum ('in', 'out');
exception
  when duplicate_object then null;
end $$;
create table if not exists public.stock_transactions (id uuid primary key default uuid_generate_v4(), transaction_date date not null default current_date, type transaction_type not null, item_id uuid not null references public.items(id), quantity numeric(14,2) not null check (quantity > 0), balance_after numeric(14,2) not null check (balance_after >= 0), recipient text, department text, purpose text, source text, officer_name text not null, initials text, notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table if not exists public.audit_logs (id uuid primary key default uuid_generate_v4(), actor_id uuid references auth.users(id), action text not null, entity text not null, entity_id uuid, metadata jsonb, created_at timestamptz not null default now());
create index if not exists stock_transactions_item_date on public.stock_transactions(item_id, transaction_date, created_at);
create index if not exists stock_transactions_type_date on public.stock_transactions(type, transaction_date);
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Admin')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', email, 'Admin')
from auth.users
on conflict (id) do nothing;
alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.items enable row level security; alter table public.stock_transactions enable row level security; alter table public.audit_logs enable row level security;
drop policy if exists "admin access profiles" on public.profiles;
drop policy if exists "admin access categories" on public.categories;
drop policy if exists "admin access items" on public.items;
drop policy if exists "admin access transactions" on public.stock_transactions;
drop policy if exists "admin access audits" on public.audit_logs;
create policy "admin access profiles" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admin access categories" on public.categories for all to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admin access items" on public.items for all to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admin access transactions" on public.stock_transactions for all to authenticated using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admin access audits" on public.audit_logs for all to authenticated using (actor_id = auth.uid()) with check (actor_id = auth.uid());
create or replace function public.record_stock_transaction(p_item_id uuid, p_type transaction_type, p_quantity numeric, p_date date, p_officer text, p_initials text default null, p_recipient text default null, p_source text default null, p_department text default null, p_purpose text default null, p_notes text default null)
returns public.stock_transactions language plpgsql security definer set search_path = public as $$
declare v_stock numeric; v_balance numeric; v_id uuid;
begin
 if p_quantity <= 0 then raise exception 'Jumlah transaksi harus lebih besar dari nol'; end if;
 select current_stock into v_stock from items where id = p_item_id for update;
 if not found then raise exception 'Barang tidak ditemukan'; end if;
 v_balance := case when p_type = 'in' then v_stock + p_quantity else v_stock - p_quantity end;
 if v_balance < 0 then raise exception 'Stok tidak mencukupi'; end if;
 update items set current_stock = v_balance, updated_at = now() where id = p_item_id;
 insert into stock_transactions(transaction_date,type,item_id,quantity,balance_after,recipient,source,department,purpose,officer_name,initials,notes,created_by)
 values(p_date,p_type,p_item_id,p_quantity,v_balance,p_recipient,p_source,p_department,p_purpose,p_officer,p_initials,p_notes,auth.uid()) returning id into v_id;
 insert into audit_logs(actor_id,action,entity,entity_id,metadata) values(auth.uid(), 'create', 'stock_transaction', v_id, jsonb_build_object('type',p_type,'quantity',p_quantity));
 return (select t from stock_transactions t where t.id = v_id);
end; $$;
revoke execute on function public.record_stock_transaction(uuid, transaction_type, numeric, date, text, text, text, text, text, text, text) from public;
grant execute on function public.record_stock_transaction(uuid, transaction_type, numeric, date, text, text, text, text, text, text, text) to authenticated;
