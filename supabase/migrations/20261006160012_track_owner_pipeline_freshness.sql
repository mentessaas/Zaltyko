create index if not exists outbox_events_unsettled_freshness_idx
  on zaltyko.outbox_events (organization_id, location_id, occurred_at)
  where status in ('pending', 'processing', 'failed');
