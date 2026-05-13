# Randevu Hatırlatma Sistemi — Kurulum

## Nasıl Çalışır?

```
Supabase pg_cron (saatlik)
       ↓
Edge Function (appointment-reminders)
       ↓
Web Projesi /api/cron/send-reminders      → 24s öncesi SMS (Netgsm)
Web Projesi /api/cron/send-reminders-1h   → 1s öncesi SMS (Netgsm)
       ↓
Müşteriye SMS gider
```

SMS gönderimi, limit kontrolü ve loglama tamamen web projesinde yapılır.
Mobil uygulama sadece reminder ayarlarını (`remind24h`, `remind2h`) açıp kapatır.

---

## Adım 1 — Web Projesinde CRON_SECRET Kontrol Et

`salonapy-v2/.env` dosyasında `CRON_SECRET` tanımlı olmalı.
Tanımlı değilse ekle:
```
CRON_SECRET=gizli-bir-deger-buraya
```

---

## Adım 2 — Supabase Secrets Ekle

Supabase Dashboard → Edge Functions → appointment-reminders → Secrets:

| Key | Değer |
|-----|-------|
| `BACKEND_URL` | `https://app.hemensalon.com` |
| `CRON_SECRET` | Web projesindeki `CRON_SECRET` ile **aynı değer** |

---

## Adım 3 — Edge Function Deploy Et

```bash
supabase login
supabase link --project-ref <PROJE_REF>
supabase functions deploy appointment-reminders --no-verify-jwt
```

---

## Adım 4 — pg_cron Kur

`setup.sql` içeriğini Supabase Dashboard → SQL Editor'da çalıştır.
`<PROJE_REF>` ve `<ANON_KEY>` değerlerini doldur:
- **PROJE_REF**: Dashboard → Settings → General → Reference ID
- **ANON_KEY**: Dashboard → Settings → API → anon public

---

## Test

```bash
curl -X POST \
  https://<PROJE_REF>.supabase.co/functions/v1/appointment-reminders \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Beklenen yanıt:
```json
{
  "ok": true,
  "reminders24h": { "ok": true, "data": { "sent": 0, "skipped": 0 } },
  "reminders1h":  { "ok": true, "data": { "sent": 0, "skipped": 0 } }
}
```

---

## Mobil Uygulama Entegrasyonu

Mobil uygulamadaki hatırlatma toggle'ları:
- `remind24h` → `tenant.sms24hReminder` (web DB)
- `remind2h`  → `tenant.sms1hReminder`  (web DB)

Endpoint: `GET/PUT /api/me/reminder-settings` (web projesine eklendi)
