import PagoTarjeta from '../components/proximos/PagoTarjeta'
import GastosFijos from '../components/proximos/GastosFijos'
import Cuotas from '../components/proximos/Cuotas'
import Deudas from '../components/proximos/Deudas'
import Proyeccion from '../components/proximos/Proyeccion'

/**
 * Próximos: todo lo que viene. El pago de la tarjeta que vence, los gastos
 * fijos, las cuotas activas, las deudas pendientes y la proyección mes a mes
 * (ingresos y pagos). Cada sección es un componente con su propia data y
 * responsabilidad.
 */
export default function Proximos() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Próximos</h1>
      <PagoTarjeta />
      <GastosFijos />
      <Cuotas />
      <Deudas />
      <Proyeccion />
    </section>
  )
}
