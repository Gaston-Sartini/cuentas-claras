import {
  ShoppingCart, Utensils, Bus, HeartPulse, PlugZap, House, Shirt,
  PartyPopper, GraduationCap, PawPrint, Gift, Tag,
  Landmark, Smartphone, Banknote, Wallet, CreditCard,
} from 'lucide-react'

// La columna categories.icon guarda nombres de lucide; acá se mapean a componentes.
const CATEGORY_ICONS = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  bus: Bus,
  'heart-pulse': HeartPulse,
  'plug-zap': PlugZap,
  house: House,
  shirt: Shirt,
  'party-popper': PartyPopper,
  'graduation-cap': GraduationCap,
  'paw-print': PawPrint,
  gift: Gift,
  tag: Tag,
}

export const categoryIcon = (name) => CATEGORY_ICONS[name] ?? Tag

// Para el picker al crear una categoría nueva
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

export const WALLET_ICONS = {
  bank: Landmark,
  mercadopago: Smartphone,
  cash: Banknote,
  other: Wallet,
}

export const METHOD_META = {
  cash: { label: 'Efectivo', icon: Banknote },
  mercadopago: { label: 'MercadoPago', icon: Smartphone },
  mastercard: { label: 'Mastercard', icon: CreditCard },
  visa: { label: 'Visa', icon: CreditCard },
}

// Ícono para un medio de pago de la tabla payment_methods:
// crédito => tarjeta; débito => el ícono de la billetera linkeada.
export const methodIcon = (method) => {
  if (!method) return CreditCard
  if (method.kind === 'credit') return CreditCard
  return WALLET_ICONS[method.wallets?.type] ?? Wallet
}

// Etiqueta del método de una transacción/cuota: método nuevo o enum legacy.
export const methodLabel = (row) =>
  row?.payment_methods?.name ?? METHOD_META[row?.payment_method]?.label ?? null
