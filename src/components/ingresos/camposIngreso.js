/**
 * Campos de edición de un ingreso, para EditarInline. Viven acá porque los
 * usan dos pantallas: la proyección de Próximos (meses que vienen) y los
 * ingresos del mes en curso en el Inicio.
 */
export const camposDeIngreso = (entry, wallets) => [
  {
    key: 'description',
    label: '¿Qué ingreso es?',
    tipo: 'texto',
    valor: entry.description,
  },
  {
    key: 'amount',
    label: '¿Cuánta plata entra?',
    tipo: 'monto',
    valor: Math.round(Number(entry.amount)),
  },
  {
    key: 'wallet_id',
    label: '¿A qué cuenta entra?',
    tipo: 'select',
    valor: entry.wallet_id ?? '',
    opciones: [
      { value: '', label: 'Todavía no sé' },
      ...wallets.map((w) => ({ value: w.id, label: w.name })),
    ],
  },
]
