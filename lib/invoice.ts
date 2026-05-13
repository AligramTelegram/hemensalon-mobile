import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

export type InvoiceData = {
  salonName: string
  salonPhone?: string
  salonEmail?: string
  salonAddress?: string
  invoiceNo: string
  date: string
  customerName?: string
  customerPhone?: string
  items: { description: string; quantity?: number; unitPrice: number; total: number }[]
  subtotal: number
  total: number
  paymentMethod?: string
  notes?: string
  // i18n labels — caller provides via t()
  labels: {
    invoice: string       // 'FATURA' / 'INVOICE'
    customer: string
    paymentMethod: string
    notSpecified: string
    date: string
    invoiceDate: string
    description: string
    qty: string
    unitPrice: string
    amount: string
    subtotal: string
    vat: string
    total: string
    footer: string
    notePrefix: string
    nakit: string
    kart: string
    online: string
    shareTitle: string
  }
}

function buildHTML(d: InvoiceData): string {
  const L = d.labels
  const payLabel: Record<string, string> = { NAKIT: L.nakit, KART: L.kart, ONLINE: L.online }

  const itemRows = d.items.map(item => `
    <tr>
      <td>${item.description}</td>
      <td style="text-align:center">${item.quantity ?? 1}</td>
      <td style="text-align:right">₺${item.unitPrice.toLocaleString(undefined)}</td>
      <td style="text-align:right"><strong>₺${item.total.toLocaleString(undefined)}</strong></td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 3px solid #7C3AED; }
  .logo { display: flex; align-items: center; gap: 12px; }
  .logo-icon { width: 48px; height: 48px; background: #7C3AED; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
  .logo-icon span { color: #fff; font-size: 22px; font-weight: 900; }
  .salon-name { font-size: 22px; font-weight: 900; color: #7C3AED; }
  .salon-info { font-size: 12px; color: #6B7280; margin-top: 4px; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 28px; font-weight: 900; color: #7C3AED; letter-spacing: -0.5px; }
  .invoice-no { font-size: 13px; color: #6B7280; margin-top: 4px; }
  .invoice-date { font-size: 13px; color: #6B7280; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
  .info-box { background: #F9FAFB; border-radius: 12px; padding: 16px; border: 1px solid #F3F4F6; }
  .info-label { font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .info-value { font-size: 14px; font-weight: 600; color: #111827; }
  .info-sub { font-size: 12px; color: #6B7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead { background: #7C3AED; }
  thead th { color: #fff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 14px; text-align: left; }
  thead th:not(:first-child) { text-align: center; }
  thead th:last-child { text-align: right; }
  tbody tr { border-bottom: 1px solid #F3F4F6; }
  tbody tr:last-child { border-bottom: none; }
  tbody td { padding: 13px 14px; font-size: 14px; color: #374151; }
  .totals { margin-left: auto; width: 240px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #6B7280; }
  .total-row.final { border-top: 2px solid #7C3AED; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 900; color: #111827; }
  .pay-badge { display: inline-block; background: #EDE9FE; color: #7C3AED; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; margin-top: 6px; }
  .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #F3F4F6; text-align: center; font-size: 11px; color: #9CA3AF; }
  .footer strong { color: #7C3AED; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon"><span>${d.salonName.charAt(0).toUpperCase()}</span></div>
      <div>
        <div class="salon-name">${d.salonName}</div>
        <div class="salon-info">${[d.salonPhone, d.salonEmail].filter(Boolean).join(' · ')}</div>
        ${d.salonAddress ? `<div class="salon-info">${d.salonAddress}</div>` : ''}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">${L.invoice}</div>
      <div class="invoice-no">#${d.invoiceNo}</div>
      <div class="invoice-date">${new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  ${d.customerName ? `
  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">${L.customer}</div>
      <div class="info-value">${d.customerName}</div>
      ${d.customerPhone ? `<div class="info-sub">${d.customerPhone}</div>` : ''}
    </div>
    <div class="info-box">
      <div class="info-label">${L.paymentMethod}</div>
      <div class="info-value">${d.paymentMethod ? payLabel[d.paymentMethod] ?? d.paymentMethod : L.notSpecified}</div>
      <div class="info-sub">${L.date}: ${new Date(d.date).toLocaleDateString(undefined)}</div>
    </div>
  </div>
  ` : `
  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">${L.invoiceDate}</div>
      <div class="info-value">${new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    <div class="info-box">
      <div class="info-label">${L.paymentMethod}</div>
      <div class="info-value">${d.paymentMethod ? payLabel[d.paymentMethod] ?? d.paymentMethod : L.notSpecified}</div>
    </div>
  </div>
  `}

  <table>
    <thead>
      <tr>
        <th>${L.description}</th>
        <th style="text-align:center">${L.qty}</th>
        <th style="text-align:right">${L.unitPrice}</th>
        <th style="text-align:right">${L.amount}</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span>${L.subtotal}</span>
      <span>₺${d.subtotal.toLocaleString(undefined)}</span>
    </div>
    <div class="total-row">
      <span>${L.vat}</span>
      <span>₺0</span>
    </div>
    <div class="total-row final">
      <span>${L.total}</span>
      <span>₺${d.total.toLocaleString(undefined)}</span>
    </div>
    ${d.paymentMethod ? `<div><span class="pay-badge">${payLabel[d.paymentMethod] ?? d.paymentMethod}</span></div>` : ''}
  </div>

  ${d.notes ? `<div style="margin-top:24px;padding:14px;background:#F9FAFB;border-radius:10px;font-size:13px;color:#6B7280;"><strong style="color:#374151">${L.notePrefix}: </strong>${d.notes}</div>` : ''}

  <div class="footer">
    ${L.footer}
  </div>
</body>
</html>`
}

export async function generateAndShareInvoice(data: InvoiceData): Promise<void> {
  const html = buildHTML(data)
  const { uri } = await Print.printToFileAsync({ html, base64: false })
  const canShare = await Sharing.isAvailableAsync()
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: data.labels.shareTitle })
  } else {
    await Print.printAsync({ html })
  }
}
