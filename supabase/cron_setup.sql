SELECT cron.schedule(
  'send-reminders-24h',
  '0 * * * *',
  $$SELECT net.http_get(
    url := 'https://app.hemensalon.com/api/cron/send-reminders',
    headers := '{"Authorization": "Bearer hs-cron-2026-secret"}'::jsonb
  )$$
);

SELECT cron.schedule(
  'send-reminders-1h',
  '0 * * * *',
  $$SELECT net.http_get(
    url := 'https://app.hemensalon.com/api/cron/send-reminders-1h',
    headers := '{"Authorization": "Bearer hs-cron-2026-secret"}'::jsonb
  )$$
);

SELECT cron.schedule(
  'completion-reminders',
  '*/10 * * * *',
  $$SELECT net.http_get(
    url := 'https://app.hemensalon.com/api/cron/completion-reminders',
    headers := '{"Authorization": "Bearer hs-cron-2026-secret"}'::jsonb
  )$$
);

SELECT cron.schedule(
  'daily-tips',
  '0 7-17 * * *',
  $$SELECT net.http_get(
    url := 'https://app.hemensalon.com/api/cron/daily-tips',
    headers := '{"Authorization": "Bearer hs-cron-2026-secret"}'::jsonb
  )$$
);
