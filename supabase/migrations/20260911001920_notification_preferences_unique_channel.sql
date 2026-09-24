CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_profile_channel_unique
  ON public.notification_preferences (profile_id, channel);
