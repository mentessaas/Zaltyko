alter table public.classes
  add column if not exists technical_focus text,
  add column if not exists apparatus text[];

alter table public.groups
  add column if not exists technical_focus text,
  add column if not exists apparatus text[],
  add column if not exists session_blocks text[];
