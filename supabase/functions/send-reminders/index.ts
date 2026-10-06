// ============================================================================
// CUENTAS CLARAS · Edge Function send-reminders
// Push real de vencimientos: corre cada mañana (pg_cron -> pg_net) y manda
// un Web Push por familia con lo que vence pronto.
//
//  · Avisa por tres cosas: gastos fijos con día de vencimiento, deudas con
//    fecha y el resumen de cada tarjeta (payment_methods.due_day). El monto
//    de la tarjeta sale de la vista v_card_statements, que es el espejo en
//    SQL de useCardStatements: el aviso dice el mismo número que la pantalla.
//  · Espejo en servidor de src/lib/vencimientos.js (misma regla de fechas).
//  · Claves VAPID y secreto del cron en app_secrets (solo service role).
//  · Sin tabla de log: corre 1 vez al día y avisa solo cuando faltan
//    exactamente los días de la ventana, así no repite.
//  · Suscripciones muertas (404/410 del push service) se borran solas.
//  · POST {"dry_run": true} con el secreto del cron: devuelve lo que mandaría.
//  · POST {"test": true} con el token de un usuario: le manda un aviso de
//    prueba a su familia. Es la única forma de comprobar desde el teléfono
//    que la cadena servidor -> navegador funciona sin esperar a que algo
//    venza de verdad.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.47.0'
import webpush from 'npm:web-push@3.6.7'

type Tipo = 'fijo' | 'deuda' | 'tarjeta'
type Item = { org_id: string; titulo: string; monto: number; dias: number; tipo: Tipo }

const TZ = 'America/Argentina/Buenos_Aires'

// Cuántos días antes avisa cada cosa. La tarjeta avisa más veces y desde más
// lejos a propósito: es el número más grande del mes y hay que llegar a
// juntar la plata. Son días exactos porque corre una vez al día: así no repite.
const DIAS_AVISO = [2, 0]
const DIAS_AVISO_TARJETA = [5, 3, 1, 0]
const DIAS_PREVIEW = 7 // ventana que muestra el aviso de prueba

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
    : dias === 1
      ? 'vence mañana'
      : dias === -1
        ? 'venció ayer'
        : dias < 0
          ? `venció hace ${-dias} días`
          : `vence en ${dias} días`

const linea = (i: Item) => `${i.titulo}: ${etiqueta(i.dias)} (${fmtARS(i.monto)})`

// El botón "Probar" llama desde el navegador (otro origen), así que la
// función tiene que contestar el preflight y mandar las cabeceras CORS.
// Origen abierto sin riesgo: toda respuesta exige token de usuario o el
// secreto del cron, y no se usan cookies, así que el navegador de un tercero
// no puede sacar nada que no pudiera sacar con curl.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS })

/**
 * Todo lo que vence, con cuántos días faltan para cada cosa. Sin filtrar:
 * el aviso diario se queda con los días exactos de su ventana y el aviso de
 * prueba con la semana que viene, pero la regla de fechas se escribe una vez.
 */
const recolectar = async (admin: SupabaseClient, hoy: string): Promise<Item[]> => {
  const [{ data: fijos }, { data: deudas }, { data: tarjetas }] = await Promise.all([
    admin
      .from('recurring_expenses')
      .select('org_id, description, amount, due_day, start_month, end_month')
      .not('due_day', 'is', null),
    admin
      .from('debts')
      .select('org_id, description, amount, direction, due_date')
      .is('settled_at', null)
      .not('due_date', 'is', null),
    admin
      .from('v_card_statements')
      .select('org_id, name, total, due_day')
      .not('due_day', 'is', null),
  ])

  const items: Item[] = []

  for (const f of fijos ?? []) {
    const fecha = proximoVencimiento(f.due_day, hoy)
    // Un fijo con vigencia vencida ya no se paga: no avisa
    if (!monthInRange(f.start_month, f.end_month, `${fecha.slice(0, 7)}-01`)) continue
    items.push({
      org_id: f.org_id,
      titulo: f.description,
      monto: Number(f.amount),
      dias: dayDiff(hoy, fecha),
      tipo: 'fijo',
    })
  }

  for (const d of deudas ?? []) {
    items.push({
      org_id: d.org_id,
      titulo: d.direction === 'we_owe' ? `Pagar: ${d.description}` : `Cobrar: ${d.description}`,
      monto: Number(d.amount),
      dias: dayDiff(hoy, d.due_date),
      tipo: 'deuda',
    })
  }

  // La vista sólo trae tarjetas con algo pendiente: si el resumen ya se marcó
  // como pagado no hay nada que avisar, aunque el día de vencimiento llegue.
  for (const t of tarjetas ?? []) {
    items.push({
      org_id: t.org_id,
      titulo: `Tarjeta ${t.name}`,
      monto: Number(t.total),
      dias: dayDiff(hoy, proximoVencimiento(t.due_day, hoy)),
      tipo: 'tarjeta',
    })
  }

  return items
}

// Lo que toca avisar hoy: días exactos, para que corriendo una vez al día no repita
const paraAvisarHoy = (items: Item[]) =>
  items.filter((i) =>
    i.tipo === 'tarjeta'
      ? DIAS_AVISO_TARJETA.includes(i.dias)
      : DIAS_AVISO.includes(i.dias) || (i.tipo === 'deuda' && i.dias === -1)
  )

const porFamilia = (items: Item[]) => {
  const acc = new Map<string, Item[]>()
  for (const it of items) acc.set(it.org_id, [...(acc.get(it.org_id) ?? []), it])
  return acc
}

const ordenados = (items: Item[]) => [...items].sort((a, b) => a.dias - b.dias)

/** Manda un payload a todas las suscripciones de una familia. Borra las muertas. */
const enviar = async (
  admin: SupabaseClient,
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: string
) => {
  let sent = 0
  let failed = 0
  const muertas: string[] = []

  for (const s of subs) {
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

  if (muertas.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', muertas)
  }

  return { sent, failed, pruned: muertas.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

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
    return json({ error: 'faltan secretos en app_secrets' }, 500)
  }

  webpush.setVapidDetails(
    'https://cuentas-claras-familia.netlify.app',
    secrets.vapid_public,
    secrets.vapid_private
  )

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; test?: boolean }
  const hoy = hoyISO()

  // ------------------------------------------------------------------------
  // Aviso de prueba: lo pide un usuario logueado para su propia familia.
  // No lleva el secreto del cron, así que la autorización es su token.
  // ------------------------------------------------------------------------
  if (body?.test === true) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: auth } = await admin.auth.getUser(token)
    if (!auth?.user) return json({ error: 'no autorizado' }, 401)

    const { data: perfil } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', auth.user.id)
      .single()
    if (!perfil?.org_id) return json({ error: 'perfil sin familia' }, 403)

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('org_id', perfil.org_id)
    if (!subs || subs.length === 0) {
      return json({ ok: false, motivo: 'sin_suscripciones' })
    }

    // Que la prueba muestre los vencimientos reales de la semana: así se ve
    // de una si no llegan avisos porque algo está roto o porque no hay nada.
    const proximos = ordenados(
      (await recolectar(admin, hoy)).filter((i) => i.org_id === perfil.org_id && i.dias <= DIAS_PREVIEW)
    )
    const resultado = await enviar(
      admin,
      subs,
      JSON.stringify({
        title: 'Los avisos funcionan ✅',
        body:
          proximos.length > 0
            ? `Esto es lo que vence pronto:\n${proximos.map(linea).join('\n')}`
            : `No hay nada por vencer en los próximos ${DIAS_PREVIEW} días. Cuando haya, te aviso por acá.`,
        tag: `cc-prueba-${Date.now()}`,
        url: '/',
      })
    )

    return json({ ok: resultado.sent > 0, ...resultado, proximos: proximos.length })
  }

  // ------------------------------------------------------------------------
  // Envío diario: solo el cron (o alguien con el secreto) puede dispararlo
  // ------------------------------------------------------------------------
  if (req.headers.get('x-cron-secret') !== secrets.cron_secret) {
    return json({ error: 'no autorizado' }, 401)
  }

  const todos = await recolectar(admin, hoy)
  const grupos = porFamilia(paraAvisarHoy(todos))

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, org_id, endpoint, p256dh, auth')

  if (body?.dry_run === true) {
    return json({
      ok: true,
      dry_run: true,
      hoy,
      familias: grupos.size,
      suscripciones: subs?.length ?? 0,
      avisos: [...grupos.values()].flat().map((i) => `${i.titulo} · ${etiqueta(i.dias)}`),
    })
  }

  let sent = 0
  let failed = 0
  let pruned = 0

  // Un aviso resumen por familia (mismo tag => el navegador no duplica)
  for (const [orgId, avisos] of grupos) {
    const destinos = (subs ?? []).filter((s) => s.org_id === orgId)
    if (destinos.length === 0) continue

    const resultado = await enviar(
      admin,
      destinos,
      JSON.stringify({
        title:
          avisos.length === 1
            ? 'Vencimiento a la vista'
            : `${avisos.length} vencimientos a la vista`,
        body: ordenados(avisos).map(linea).join('\n'),
        tag: `cc-venc-${hoy}`,
        url: '/',
      })
    )
    sent += resultado.sent
    failed += resultado.failed
    pruned += resultado.pruned
  }

  return json({ ok: true, hoy, familias: grupos.size, sent, failed, pruned })
})
