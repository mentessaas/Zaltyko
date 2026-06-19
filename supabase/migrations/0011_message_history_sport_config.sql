alter table if exists message_history
  add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;

create index if not exists message_history_sport_config_idx
  on message_history (sport_config_id);
