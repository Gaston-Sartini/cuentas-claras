// ============================================================================
// CUENTAS CLARAS · Edge Function send-reminders
// Push real de vencimientos: corre cada mañana (pg_cron -> pg_net) y manda
// un Web Push por familia con lo que vence hoy, en 2 días o venció ayer.
//
//  · Espejo en servidor de src/lib/vencimientos.js (misma regla de fechas).
//  · Claves VAPID y secreto del cron en app_secrets (solo service role).
//  · Sin tabla de log: corre 1 vez al día y avisa solo cuando faltan
//    exactamente {2, 0} días (o -1 para deudas), así no repite.
//  · Suscripciones muertas (404/410 del push service) se borran solas.
//  · POST {"dry_run": true} devuelve lo que mandaría, sin mandar nada.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.47.0'
import webpush from 'npm:web-push@3.6.7'

type Item = { org_id: string; titulo: string; monto: number; dias: number }

const TZ = 'America/Argentina/Buenos_Aires'
const DIAS_AVISO = [2, 0] // aviso previo y el mismo día

const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

// Próximo vencimiento de un día-de-mes (31 en un mes de 30 = último día)
const proximoVencimiento = (dueDay: number, hoy: string) => {
  const [y, m] = hoy.split('-').map(Number)
  const enMes = (yy: number, mm: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dueDay, daysInMonth(yy, mm))).padStart(2, '0')}`
  const esteMes = enMes(y, m)
  if (esteMes >= hoy) return esteMes
  return m === 12 ? enMes(y + 1, 1) : enMes(y, m + 1)
}

const monthInRange = (start: string, end: string | null, monthISO: string) =>
  start <= monthISO && (!end || end >= monthISO)

const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)

const etiqueta = (dias: number) =>
  dias === 0
    ? 'vence hoy'
    : dias === 2
      ? 'vence pasado mañana'
      : dias === -1
        ? 'venció ayer'
        : `vence en ${dias} días`

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Secretos: claves VAPID + secreto compartido con el cron
  const { data: secretRows, error: secretsError } = await admin
    .from('app_secrets')
    .select('key, value')
    .in('key', ['vapid_public', 'vapid_private', 'cron_secret'])
  const secrets = Object.fromEntries((secretRows ?? []).map((r) => [r.key, r.value]))
  if (secretsError || !secrets.vapid_public || !secrets.vapid_private || !secrets.cron_secret) {
    return Response.json({ error: 'faltan secretos en app_secrets' }, { status: 500 })
  }

  // Solo el cron (o alguien con el secreto) puede disparar envíos
  if (req.headers.get('x-cron-secret') !== secrets.cron_secret) {
    return Response.json({ error: 'no autorizado' }, { status: 401 })
  }

  const dryRun = (await req.json().catch(() => ({})))?.dry_run === true
  const hoy = hoyISO()

  const [{ data: fijos }, { data: deudas }, { data: subs }] = await Promise.all([
    admin
      .from('recurring_expenses')
      .select('org_id, description, amount, due_day, start_month, end_month')
      .not('due_day', 'is', null),
    admin
      .from('debts')
      .select('org_id, description, amount, direction, due_date')
      .is('settled_at', null)
      .not('due_date', 'is', null),
    admin.from('push_subscriptions').select('id, org_id, endpoint, p256dh, auth'),
  ])

  // Qué avisar hoy, por familia (misma regla que src/lib/vencimientos.js)
  const items: Item[] = []
  for (const f of fijos ?? []) {
    const fecha = proximoVencimiento(f.due_day, hoy)
    const dias = dayDiff(hoy, fecha)
    if (!DIAS_AVISO.includes(dias)) continue
    if (!monthInRange(f.start_month, f.end_month, `${fecha.slice(0, 7)}-01`)) continue
    items.push({ org_id: f.org_id, titulo: f.description, monto: Number(f.amount), dias })
  }
  for (const d of deudas ?? []) {
    const dias = dayDiff(hoy, d.due_date)
    if (!DIAS_AVISO.includes(dias) && dias !== -1) continue
    const titulo = d.direction === 'we_owe' ? `Pagar: ${d.description}` : `Cobrar: ${d.description}`
    items.push({ org_id: d.org_id, titulo, monto: Number(d.amount), dias })
  }

  // Un aviso resumen por familia (mismo tag => el navegador no duplica)
  const porOrg = new Map<string, Item[]>()
  for (const it of items) porOrg.set(it.org_id, [...(porOrg.get(it.org_id) ?? []), it])

  if (dryRun) {
    return Response.json({
      ok: true,
      dry_run: true,
      hoy,
      familias: porOrg.size,
      suscripciones: subs?.length ?? 0,
      avisos: [...porOrg.values()].flat().map((i) => `${i.titulo} · ${etiqueta(i.dias)}`),
    })
  }

  webpush.setVapidDetails(
    'https://cuentas-claras-familia.netlify.app',
    secrets.vapid_public,
    secrets.vapid_private
  )

  let sent = 0
  let failed = 0
  const muertas: string[] = []

  for (const [orgId, avisos] of porOrg) {
    const destinos = (subs ?? []).filter((s) => s.org_id === orgId)
    if (destinos.length === 0) continue

    const cuerpo = avisos
      .sort((a, b) => a.dias - b.dias)
      .map((i) => `${i.titulo}: ${etiqueta(i.dias)} (${fmtARS(i.monto)})`)
      .join('\n')
    const payload = JSON.stringify({
      title: avisos.length === 1 ? 'Vencimiento a la vista' : `${avisos.length} vencimientos a la vista`,
      body: cuerpo,
      tag: `cc-venc-${hoy}`,
      url: '/',
    })

    for (const s of destinos) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 12 }
        )
        sent++
      } catch (err) {
        failed++
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) muertas.push(s.id) // navegador desuscripto
      }
    }
  }

  if (muertas.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', muertas)
  }

  return Response.json({ ok: true, hoy, familias: porOrg.size, sent, failed, pruned: muertas.length })
})
