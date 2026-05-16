/**
 * Müşteri hatırlatmaları backend cron job'ları tarafından otomatik gönderilir:
 *
 *  - /api/cron/send-reminders    → 24 saat öncesi (SMS + Email)
 *  - /api/cron/send-reminders-1h → 1 saat öncesi  (SMS + Email)
 *
 * Hatırlatma kanalı müşteriye göre belirlenir:
 *  - Türkiye telefon numarası → SMS (NetGSM)
 *  - Email adresi varsa      → Email (Resend)
 *
 * Ayarlar mobil uygulama üzerinden değiştirilebilir:
 *  - Ayarlar → Entegrasyon → 24 saat hatırlatma / 1 saat hatırlatma
 *  - API: PUT /api/me/reminder-settings { remind24h, remind2h }
 */
export {}
