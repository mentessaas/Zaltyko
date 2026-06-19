alter table if exists message_templates
  add column if not exists sport_config_id uuid references academy_sport_configs(id) on delete set null;

create index if not exists message_templates_sport_config_idx
  on message_templates (sport_config_id);
