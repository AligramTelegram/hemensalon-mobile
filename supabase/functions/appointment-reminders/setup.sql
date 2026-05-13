-- ============================================================
-- pg_cron kurulumu — Supabase Dashboard > SQL Editor'da çalıştır
--
-- <PROJE_REF> → Dashboard > Settings > General > Reference ID
-- <ANON_KEY>  → Dashboard > Settings > API > anon public key
-- ============================================================

-- pg_cron ve pg_net extension'larını aç (yoksa):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'appointment-reminders',
  '0 * * * *',   -- her saat başı
  $$
    SELECT net.http_post(
      url     := 'https://<PROJE_REF>.supabase.co/functions/v1/appointment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <ANON_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Kurulumu doğrula:
-- SELECT * FROM cron.job;

-- Silmek istersen:
-- SELECT cron.unschedule('appointment-reminders');
