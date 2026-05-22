SELECT cron.schedule(
  'vercel-warmup-ping',
  '*/5 * * * *',
  $$SELECT net.http_get(
    url := 'https://app.hemensalon.com/api/health'
  )$$
);
