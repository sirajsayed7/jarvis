create table if not exists public.jarvis_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  command text not null check (char_length(command) between 1 and 10000),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','awaiting_approval')),
  result text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.jarvis_commands enable row level security;
create policy "users manage their commands" on public.jarvis_commands
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.jarvis_commands;
