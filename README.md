<div align="center">

<img src="public/pwa-192.png" width="80" alt="Cuentas Claras" />

# Cuentas Claras

**PWA de gastos familiares: carga en 10 segundos, proyección de lo que viene, y toda la familia en la misma cuenta.**

[![React](https://img.shields.io/badge/React_18-20232A?logo=react&logoColor=61DAFB)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite_6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![PWA](https://img.shields.io/badge/PWA-instalable-9E1B1B)](https://cuentas-claras-familia.netlify.app)
[![Tests](https://img.shields.io/badge/tests_SQL-76_✓-17693A)](supabase/tests)

**[✨ Probala en vivo → cuentas-claras-familia.netlify.app](https://cuentas-claras-familia.netlify.app)**

Cuenta demo: `demo-portfolio@cuentasclaras.test` · `demo-portfolio-2026`
*(sandbox aislado por Row Level Security — entrá y tocá todo)*

</div>

> **EN** — A family expense tracker PWA built with React + Supabase. Multi-tenant
> (whole family shares one realtime workspace), credit-card purchases roll into
> next month's bill, installment plans and fixed expenses project the months
> ahead, and every business rule lives in Postgres (triggers + RLS), covered by
> a 76-assertion SQL test suite that runs against a disposable Docker Postgres.

---

## Capturas

| El banner rojo, siempre visible | Cargar un gasto | Resumen con topes |
|:---:|:---:|:---:|
| <img src="docs/screenshots/inicio.png" width="260" alt="Inicio: saludo, banner rojo con lo que viene el mes próximo y últimos movimientos" /> | <img src="docs/screenshots/cargar.png" width="260" alt="Formulario de carga: monto grande, categorías en grilla y medios de pago propios" /> | <img src="docs/screenshots/historial.png" width="260" alt="Historial: resumen por categoría con presupuestos y comparativa contra el mes anterior" /> |

| Proyección mes a mes | Cuotas y gastos fijos | Billeteras |
|:---:|:---:|:---:|
| <img src="docs/screenshots/proyeccion.png" width="260" alt="Proyección: cuánto entra y cuánto sale cada mes, item por item" /> | <img src="docs/screenshots/proximos.png" width="260" alt="Próximos: gastos fijos mensuales y planes de cuotas" /> | <img src="docs/screenshots/billeteras.png" width="260" alt="Billeteras: saldos en tiempo real y retiro de cajero" /> |

## La idea

La app nació con un requisito no negociable: **tenía que poder usarla una
persona de 85 años**. Eso definió todo — tipografía grande (18px de base),
botones de 48px mínimo, cero jerga financiera, y una sola acción importante
por pantalla.

La segunda idea fuerte es el **banner rojo**: arriba de todo, siempre visible,
está lo que la familia ya se comprometió a pagar el mes que viene (tarjetas +
cuotas + gastos fijos). Es un freno psicológico antes de pasar la tarjeta de
nuevo.

## Qué hace

- 🏠 **Cuenta familiar compartida** — el primer usuario crea la familia y recibe
  un código de invitación; el resto se suma con ese código y ve todo al
  instante (Supabase Realtime en cada tabla).
- ⚡ **Carga en segundos** — monto, categoría en grilla, medio de pago y listo.
  Categorías y medios de pago nuevos se crean inline, sin salir del formulario.
- 💳 **Tarjetas ilimitadas y propias** — "Visa Gastón", "Amex Yami"… Crédito
  imputa al mes siguiente; débito se linkea a una billetera (ej: "BBVA") y
  descuenta al instante.
- 🔢 **Cuotas** — al pagar con crédito elegís en cuántas cuotas; el plan se
  proyecta automáticamente en los meses que vienen. También se cargan planes
  ya empezados ("voy por la 3 de 12").
- 📅 **Gastos fijos** — alquiler, expensas, luz: se cargan una vez y alimentan
  la proyección de todos los meses.
- 📊 **Resumen mensual** — barras por categoría con porcentaje (tocás una y ves
  los movimientos que la suman), presupuestos con semáforo (verde → ámbar →
  rojo), radar de **gastos hormiga** y comparativa contra el mes anterior.
  Exportable a CSV.
- 🚦 **Freno de presupuesto** — al cargar un gasto, si la categoría tiene tope
  te avisa *antes de guardar* cuánto va consumido y si con este gasto te pasás.
- 💵 **Disponible por día, contra la plata real** — el Inicio muestra lo que
  hay hoy sumando todas las billeteras (no una proyección), y cuánto es por
  día hasta fin de mes. Cualquier movimiento real lo recalcula solo. Aparte
  contrasta contra lo proyectado y avisa la diferencia.
- 📥 **Ingresos con cuenta destino** — cada ingreso dice a qué billetera entra
  ("Sueldo Yami → BBVA"). Cuando la plata cae, se marca con un toque y el
  saldo sube solo (trigger en la base); desmarcarlo lo devuelve. Un sueldo que
  se repite se marca mes a mes.
- 🤝 **Deudas y préstamos** — "me deben / debo" con vencimiento opcional; se
  marcan saldadas con un toque y quedan en el historial.
- ⏰ **Vencimientos con aviso push** — fijos con día de vencimiento y deudas
  con fecha aparecen en el Inicio; con "Avisarme", el aviso llega por Web Push
  cada mañana **aunque la app esté cerrada** (2 días antes, el mismo día y si
  venció ayer). Si el navegador no soporta push, cae al aviso local al abrir.
- 🔮 **Proyección** — para cada mes futuro: cuánto entra (ingresos con nombre:
  "Sueldo Yami" que se repite todos los meses, "Plata que debía Nico" puntual),
  cuánto sale (por tarjeta y por gasto fijo, ítem por ítem) y cuánto queda.
- 👛 **Billeteras** — saldos de Banco / MercadoPago / Efectivo que se mueven
  solos con cada gasto, ajuste manual, y "¿Sacaste plata del cajero?" que
  transfiere Banco → Efectivo sin contar como gasto.
- 📲 **PWA instalable** — botón "Instalar la app" propio (Android) e
  instrucciones para iPhone; actualización silenciosa al abrir; carga offline
  con cola que sincroniza al volver la señal.

## Stack y arquitectura

**React 18 + Vite 6 · Tailwind CSS v4 · Supabase (Postgres + Auth + Realtime) · vite-plugin-pwa · Netlify**

La decisión central: **la lógica de negocio vive en la base de datos**, no en
el cliente. Cualquier app que inserte una fila obtiene el mismo comportamiento.

- **`billing_month` en cada transacción** — el mes contable al que imputa.
  Un trigger enruta las compras con crédito al mes siguiente; el banner rojo,
  el historial y el cierre mensual son simples agregaciones por esta columna.
- **Saldos por triggers** — insertar/editar/borrar un gasto ajusta la billetera
  correspondiente de forma atómica (editar revierte el efecto viejo y aplica el
  nuevo).
- **Multi-tenant con RLS** — todas las tablas tienen `org_id` y políticas
  `org_id = current_org_id()`. `current_org_id()` es `SECURITY DEFINER` (evita
  recursión de RLS) y las funciones internas están revocadas de la API REST.
- **RPCs atómicas** — `transfer_between_wallets()` (retiro de cajero),
  `settle_card_month()` (cierre de tarjeta, a prueba de doble toque),
  `get_next_month_projection()` (el banner), `check_invite_code()` (validación
  pre-signup).
- **Medios de pago como datos, no como enum** — la tabla `payment_methods`
  (kind `credit`/`debit` + billetera linkeada) reemplazó al enum original sin
  romper datos históricos: los triggers entienden ambos mundos.
- **Realtime por tabla** — cada hook abre su canal con sufijo único
  (`crypto.randomUUID()`): dos componentes pueden montar el mismo hook sin
  colisionar.
- **Push real sin servidor propio** — la Edge Function `send-reminders`
  (Deno + `npm:web-push`) corre cada mañana vía `pg_cron` + `pg_net`, lee las
  claves VAPID de `app_secrets` (tabla sin acceso desde la API: solo service
  role) y manda un resumen de vencimientos por familia a cada navegador
  suscripto (`push_subscriptions`). Las suscripciones muertas (404/410) se
  podan solas, y un secreto compartido en el header evita disparos ajenos.

```
src/
├── context/    AuthContext (sesión + perfil + org)
├── hooks/      un hook por agregado (wallets, methods, budgets, ledger, ...)
│               → fetch + realtime + mutaciones, la UI no toca supabase-js
│               useSupabaseLive: el patrón carga-inicial + refresco realtime, una sola vez
├── lib/        supabase client, formato AR$, fechas, filtros de pago, cola offline, CSV
├── pages/      Inicio · Cargar · Historial · Billeteras · Próximos · Familia
└── components/ ui/ (piezas de formulario compartidas) · inicio/ · cargar/ ·
                historial/ · proximos/ · ingresos/ · banner, nav, ...

supabase/
├── migrations/ 14 migraciones incrementales (esquema + RLS + triggers + RPCs)
├── functions/  send-reminders: el push diario de vencimientos (Deno + web-push)
└── tests/      suite SQL: 76 aserciones sobre Postgres 16 en Docker
```

## Tests

Toda regla de negocio del esquema tiene test: enrutamiento de tarjetas,
impacto en billeteras (alta/edición/borrado), aislamiento RLS entre familias,
invitaciones, cierre mensual idempotente, medios de pago custom, gastos fijos
con vigencia y vencimiento, presupuestos, ingresos por ítem (recurrentes y
puntuales) y deudas.

```bash
docker run -d --name cc-test -e POSTGRES_PASSWORD=pw \
  -v "$PWD/supabase:/sql:ro" postgres:16

docker exec cc-test psql -U postgres -v ON_ERROR_STOP=1 \
  -f /sql/tests/00_mock_supabase.sql \
  -f /sql/migrations/00001_init.sql ... -f /sql/migrations/00014_income_receipts.sql \
  -f /sql/tests/01_smoke_test.sql ... -f /sql/tests/10_income_receipts_test.sql
# => 76 aserciones verdes
```

El mock (`00_mock_supabase.sql`) simula `auth.users`, `auth.uid()` y los roles
de Supabase, así la suite corre en un Postgres pelado sin depender de nada.

## Correrlo local

```bash
git clone https://github.com/Gaston-Sartini/cuentas-claras.git
cd cuentas-claras
npm install
npm run dev
```

El `.env.production` versionado apunta al proyecto Supabase de producción — la
anon key es pública por diseño (viaja en el bundle del navegador) y la RLS
protege los datos. Para un backend propio: crear un proyecto en Supabase,
correr las migraciones de `supabase/migrations/` en orden desde el SQL Editor,
desactivar *Confirm email* en Auth, y completar `.env` con la URL y anon key
propias.

## Decisiones que me gustan

- **Los retiros de cajero no son gastos.** Mover plata de Banco a Efectivo
  loguea una transacción `kind='transfer'` neutra: no infla el resumen ni la
  proyección.
- **Los gastos fijos son proyección, no transacciones.** Avisan lo que viene;
  cuando llega el mes y pagás las expensas de verdad, cargás el gasto real.
  Nada se cuenta dos veces.
- **El cierre de tarjeta es a prueba de doble toque.** `settle_card_month()`
  calcula el total desde el `UPDATE ... RETURNING`: la segunda llamada devuelve
  0 y no descuenta dos veces.
- **Compatibilidad hacia atrás en serio.** El enum de medios de pago quedó como
  legacy y los triggers entienden ambos formatos: los datos cargados el primer
  día siguen funcionando hoy.

---

<div align="center">
<sub>Hecho por <a href="https://github.com/Gaston-Sartini">Gastón Sartini</a> · React + Supabase · 2026</sub>
</div>
