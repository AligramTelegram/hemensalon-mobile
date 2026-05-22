/**
 * Supabase Edge Function — appointment-reminders
 * Saatlik pg_cron tarafından tetiklenir.
 * Doğrudan Supabase REST API + Netgsm SMS + Resend email.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL   = Deno.env.get('MY_SUPABASE_URL')  ?? Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('MY_SERVICE_KEY')    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const NETGSM_USER    = Deno.env.get('NETGSM_USER_CODE')  ?? ''
const NETGSM_PASS    = Deno.env.get('NETGSM_PASSWORD')   ?? ''
const NETGSM_HEADER  = Deno.env.get('NETGSM_HEADER')     ?? 'HMNSLNYZLM'
const RESEND_KEY     = Deno.env.get('RESEND_API_KEY')    ?? ''

const REST = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  'apikey':        SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type':  'application/json',
}

// ── REST yardımcıları ─────────────────────────────────────────────────────────

async function dbSelect(table: string, params: Record<string, string>): Promise<unknown[]> {
  const url = new URL(`${REST}/${table}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: HEADERS })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GET ${table}: ${res.status} ${err}`)
  }
  return res.json()
}

async function dbInsert(table: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${REST}/${table}`, {
    method:  'POST',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`INSERT ${table}: ${res.status} ${err}`)
  }
}

async function dbUpdate(table: string, id: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`${REST}/${table}?id=eq.${id}`, {
    method:  'PATCH',
    headers: { ...HEADERS, 'Prefer': 'return=minimal' },
    body:    JSON.stringify(body),
  })
}

// ── Netgsm SMS ────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('90') && d.length === 12) d = d.slice(2)
  if (d.startsWith('0')  && d.length === 11) d = d.slice(1)
  return d
}

async function sendSms(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!NETGSM_USER || !NETGSM_PASS) return { success: false, error: 'Netgsm yapılandırılmamış' }
  const gsm = normalizePhone(phone)
  if (gsm.length !== 10) return { success: false, error: `Geçersiz numara: ${phone}` }

  try {
    const res  = await fetch('https://api.netgsm.com.tr/sms/rest/v2/send', {
      method:  'POST',
      headers: { 'Authorization': `Basic ${btoa(`${NETGSM_USER}:${NETGSM_PASS}`)}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ msgheader: NETGSM_HEADER, messages: [{ msg: message, no: gsm }], encoding: 'TR', iysfilter: '0', appname: 'hemensalon' }),
      signal:  AbortSignal.timeout(10000),
    })
    const json = await res.json().catch(() => ({}))
    const ok   = ['00','01','02'].includes(json?.code ?? '')
    return ok ? { success: true } : { success: false, error: `Netgsm ${json?.code}` }
  } catch (e) { return { success: false, error: String(e) } }
}

// ── Resend Email ──────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_KEY) return { success: false, error: 'Resend yapılandırılmamış' }
  try {
    const res  = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from: 'Hemensalon <noreply@hemensalon.com>', to, subject, html }),
      signal:  AbortSignal.timeout(10000),
    })
    const json = await res.json().catch(() => ({}))
    return res.ok ? { success: true } : { success: false, error: json?.message }
  } catch (e) { return { success: false, error: String(e) } }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`
}

function buildEmailHtml(opts: { customerName: string; serviceName: string; date: string; time: string; tenantName: string; tenantPhone?: string }): string {
  // LOGO_URL buraya eklenecek: const logoUrl = 'https://...'
  return `<!DOCTYPE html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Randevu Hatırlatması</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f6;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6f6;">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- LOGO -->
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#18181b;border-radius:10px;padding:10px 20px;">
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">hemensalon</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- MAIN CARD -->
        <tr>
          <td style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;overflow:hidden;">

            <!-- TOP ACCENT -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="background:#7c3aed;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>

            <!-- HEADER -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:36px 40px 28px;">
                  <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:1.2px;">Randevu Hatırlatması</p>
                  <h1 style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;color:#09090b;line-height:1.3;">Merhaba, ${opts.customerName}</h1>
                  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;color:#71717a;line-height:1.6;">Yaklaşan randevunuzu hatırlatmak istedik. Aşağıda randevu detaylarınızı bulabilirsiniz.</p>
                </td>
              </tr>
            </table>

            <!-- DIVIDER -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:0 40px;"><div style="border-top:1px solid #f4f4f5;"></div></td></tr>
            </table>

            <!-- DETAILS -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:22px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td width="140" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.8px;vertical-align:top;padding-top:2px;">Tarih</td>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#09090b;">${opts.date}</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:16px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td width="140" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.8px;vertical-align:top;padding-top:2px;">Saat</td>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#09090b;">${opts.time}</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:16px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td width="140" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.8px;vertical-align:top;padding-top:2px;">Hizmet</td>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#09090b;">${opts.serviceName}</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:16px 40px ${opts.tenantPhone ? '0' : '28px'};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td width="140" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.8px;vertical-align:top;padding-top:2px;">İşletme</td>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#09090b;">${opts.tenantName}</td>
                </tr></table>
              </td></tr>
              ${opts.tenantPhone ? `<tr><td style="padding:16px 40px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td width="140" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.8px;vertical-align:top;padding-top:2px;">İletişim</td>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#09090b;">${opts.tenantPhone}</td>
                </tr></table>
              </td></tr>` : ''}
            </table>

            <!-- DIVIDER -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:0 40px;"><div style="border-top:1px solid #f4f4f5;"></div></td></tr>
            </table>

            <!-- FOOTER NOTE -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:24px 40px 32px;">
                  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#a1a1aa;line-height:1.7;">
                    Randevunuzu iptal etmek veya değiştirmek isterseniz lütfen işletmeyle iletişime geçin.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- BOTTOM FOOTER -->
        <tr>
          <td style="padding-top:28px;" align="center">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;line-height:1.8;">
              Bu e-posta otomatik olarak gönderilmiştir.<br>
              <a href="https://hemensalon.com" style="color:#7c3aed;text-decoration:none;">hemensalon.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

function pad(n: number) { return n.toString().padStart(2,'0') }

// reminderTag: "REMINDER_24H" veya "REMINDER_1H" — ASCII, ilike yok, kesin eşleşme
async function alreadySent(appointmentId: string, channel: string, reminderTag: string): Promise<boolean> {
  const url = new URL(`${REST}/notifications`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('appointmentId', `eq.${appointmentId}`)
  url.searchParams.set('channel', `eq.${channel}`)
  url.searchParams.set('status', 'eq.GONDERILDI')
  url.searchParams.set('message', `eq.${reminderTag}`)
  url.searchParams.set('limit', '1')
  const res = await fetch(url.toString(), { headers: HEADERS }).catch(() => null)
  if (!res || !res.ok) return false
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) && rows.length > 0
}

// ── Pencere işleme ────────────────────────────────────────────────────────────

async function processWindow(label: string, hoursAhead: number, reminderField: string) {
  const now      = new Date()
  const localNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)  // UTC+3
  const reminderTag = hoursAhead === 24 ? 'REMINDER_24H' : 'REMINDER_1H'

  let dateStr: string
  let timeFrom: string | null = null, timeTo: string | null = null

  if (hoursAhead === 24) {
    const tom = new Date(localNow); tom.setDate(tom.getDate() + 1)
    dateStr = tom.toISOString().split('T')[0]
  } else {
    dateStr = localNow.toISOString().split('T')[0]
    const f = new Date(localNow.getTime() + 30 * 60 * 1000)
    const t = new Date(localNow.getTime() + 90 * 60 * 1000)
    timeFrom = `${pad(f.getHours())}:${pad(f.getMinutes())}`
    timeTo   = `${pad(t.getHours())}:${pad(t.getMinutes())}`
  }

  // PostgREST: iki filtre için and() kullan — duplicate key problemi yok
  let appointments: Record<string, unknown>[]
  try {
    const url = new URL(`${REST}/appointments`)
    url.searchParams.set('select', 'id,date,startTime,tenantId,customerId,serviceId')
    url.searchParams.set('status', 'in.(BEKLIYOR,ONAYLANDI)')
    url.searchParams.set('and', `(date.gte.${dateStr}T00:00:00.000Z,date.lte.${dateStr}T23:59:59.999Z)`)
    const res = await fetch(url.toString(), { headers: HEADERS })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    appointments = await res.json()
  } catch (e) {
    return { smsSent: 0, emailSent: 0, errors: [`DB hatası [${label}]: ${String(e)}`] }
  }

  const filteredByDate = appointments

  let smsSent = 0, emailSent = 0
  const errors: string[] = []

  for (const appt of filteredByDate) {
    // startTime filtresi (1h penceresi için)
    if (timeFrom && timeTo) {
      const t = appt.startTime as string
      if (t < timeFrom || t > timeTo) continue
    }

    // Tenant bilgisi
    const [tenant] = await dbSelect('tenants', {
      select: 'id,name,phone,country,smsUsed,smsCredits,plan,isActive,sms24hReminder,sms1hReminder',
      id:     `eq.${appt.tenantId}`,
    }).catch(() => []) as Record<string, unknown>[]
    if (!tenant?.isActive) continue
    if (!tenant[reminderField]) continue

    // Müşteri
    const [customer] = await dbSelect('customers', {
      select: 'id,name,phone,email',
      id:     `eq.${appt.customerId}`,
    }).catch(() => []) as Record<string, unknown>[]
    if (!customer) continue

    // Hizmet
    const [service] = await dbSelect('services', {
      select: 'name',
      id:     `eq.${appt.serviceId}`,
    }).catch(() => []) as Record<string, unknown>[]

    const isTR = (tenant.country as string) === 'TR'

    // SMS
    if (isTR && customer.phone) {
      const sent = await alreadySent(appt.id as string, 'SMS', reminderTag)
      if (!sent) {
        const planLimits: Record<string, number> = { BASLANGIC: 200, PROFESYONEL: 600, ISLETME: 1600 }
        const limit    = planLimits[tenant.plan as string] ?? 200
        const hasCredit = (tenant.smsUsed as number) < limit || (tenant.smsCredits as number) > 0

        if (hasCredit) {
          const msg = `Hatirlatma: ${formatDate(appt.date as string)} ${appt.startTime} ${service?.name ?? ''} randevunuz var. ${tenant.name}`
          const res = await sendSms(customer.phone as string, msg)
          if (res.success) {
            smsSent++
            if ((tenant.smsUsed as number) < limit) {
              await dbUpdate('tenants', appt.tenantId as string, { smsUsed: (tenant.smsUsed as number) + 1 })
            } else {
              await dbUpdate('tenants', appt.tenantId as string, { smsCredits: (tenant.smsCredits as number) - 1 })
            }
          } else { errors.push(`SMS [${appt.id}]: ${res.error}`) }

          await dbInsert('notifications', {
            tenantId: appt.tenantId, appointmentId: appt.id, channel: 'SMS',
            to: customer.phone, message: reminderTag,
            status: res.success ? 'GONDERILDI' : 'BASARISIZ',
            sentAt: res.success ? new Date().toISOString() : undefined,
            errorMessage: res.error,
          })
        }
      }
    }

    // Email
    if (customer.email) {
      const sent = await alreadySent(appt.id as string, 'EMAIL', reminderTag)
      if (!sent) {
        const subject = `📅 Randevu Hatırlatması — ${formatDate(appt.date as string)} ${appt.startTime}`
        const html = buildEmailHtml({
          customerName: customer.name as string,
          serviceName:  service?.name as string ?? '',
          date:         formatDate(appt.date as string),
          time:         appt.startTime as string,
          tenantName:   tenant.name as string,
          tenantPhone:  tenant.phone as string | undefined,
        })
        const res = await sendEmail(customer.email as string, subject, html)
        if (res.success) { emailSent++ } else { errors.push(`Email [${appt.id}]: ${res.error}`) }
        await dbInsert('notifications', {
          tenantId: appt.tenantId, appointmentId: appt.id, channel: 'EMAIL',
          to: customer.email, message: reminderTag,
          status: res.success ? 'GONDERILDI' : 'BASARISIZ',
          sentAt: res.success ? new Date().toISOString() : undefined,
          errorMessage: res.error,
        })
      }
    }
  }

  return { smsSent, emailSent, errors }
}

// ── Ana handler ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const results = await Promise.all([
    processWindow('24h', 24, 'sms24hReminder'),
    processWindow('1h',  1,  'sms1hReminder'),
  ])

  const smsSent   = results.reduce((s, r) => s + r.smsSent,   0)
  const emailSent = results.reduce((s, r) => s + r.emailSent, 0)
  const errors    = results.flatMap(r => r.errors)

  return new Response(
    JSON.stringify({ ok: true, smsSent, emailSent, errors }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
