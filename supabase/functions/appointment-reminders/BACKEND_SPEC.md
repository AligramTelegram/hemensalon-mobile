# Backend Endpoint Spec: POST /api/internal/reminders/process

Bu endpoint Supabase Edge Function tarafından her saat çağrılır.

## Güvenlik
Header: `x-internal-secret: <INTERNAL_SECRET>`  
(Env var ile doğrula, dışarıdan erişimi engelle)

## Request Body
```json
{
  "windows": [
    { "label": "24h", "minutesBefore": 1440 },
    { "label": "2h",  "minutesBefore": 120 }
  ]
}
```

## Backend Mantığı (Pseudocode)

```typescript
for each window in body.windows:
  // Hedef zaman aralığı: şimdi + minutesBefore ± 30 dk
  const targetFrom = now + minutesBefore - 30 min
  const targetTo   = now + minutesBefore + 30 min

  appointments = db.appointments.findMany({
    where: {
      status: { in: ['BEKLIYOR', 'ONAYLANDI'] },
      datetime: { gte: targetFrom, lte: targetTo },
      // Daha önce bu pencerede gönderilmemiş olmalı:
      reminderSent: { not: contains(window.label) }
    },
    include: { customer: true, service: true, tenant: true }
  })

  for each appt in appointments:
    const isTurkey = appt.tenant.country === 'TR'  // veya phone prefix +90
    const hasPhone = !!appt.customer.phone
    const hasEmail = !!appt.customer.email

    if isTurkey:
      if hasPhone: sendSMS(appt)    // mevcut SMS servisinizi kullanın
      if hasEmail: sendEmail(appt)  // mevcut mail servisinizi kullanın
    else:
      if hasEmail: sendEmail(appt)  // sadece mail

    // Tekrar göndermeyi önle:
    db.appointments.update(appt.id, {
      reminderSent: append(window.label)  // örn: ["24h"] veya ["24h","2h"]
    })

## SMS Mesaj Şablonu (TR)
"Merhaba {musteri_adi}, {tarih} {saat} için {hizmet} randevunuzu hatırlatmak istedik. 
Sizi bekliyoruz! İptal için: {isletme_telefon}"

## E-posta Şablonu
Konu: "Randevu Hatırlatması — {tarih} {saat}"
İçerik: Yukarıdaki SMS metninin HTML versiyonu + işletme logosu/rengi

## Response
```json
{ "processed": 5, "smsSent": 3, "emailSent": 4, "errors": [] }
```

## Veritabanı Değişikliği
appointments tablosuna `reminderSent String[] @default([])` alanı eklenmelidir.
(Prisma: `reminderSent String[]`)
```
