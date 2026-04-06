import { Consumable, InventoryItem, ItemWithCalc, DashboardStats } from '@/types'

export const INITIAL_CAPITAL = 200
export const ROI_TARGET = 30

export function calcItem(item: InventoryItem): ItemWithCalc {
  const cost_basis = item.purchase_price + item.vinted_fees + item.boost_cost

  let margin_net: number | null = null
  let roi_percent: number | null = null

  if (item.actual_sale_price !== null) {
    margin_net = item.actual_sale_price - item.sale_fees - cost_basis
    roi_percent = cost_basis > 0 ? parseFloat(((margin_net / cost_basis) * 100).toFixed(1)) : null
  } else if (item.expected_sale_price !== null) {
    margin_net = item.expected_sale_price - cost_basis
    roi_percent = cost_basis > 0 ? parseFloat(((margin_net / cost_basis) * 100).toFixed(1)) : null
  }

  return { ...item, cost_basis, margin_net, roi_percent }
}

export function calcStats(items: InventoryItem[], initialCapital = INITIAL_CAPITAL, consumables: Consumable[] = []): DashboardStats {
  // Exclure les hits et les anciens enfants de lots
  const realItems = items.filter((i) => !i.is_hit && !(i.lot_id !== null && !i.is_lot))

  const sold  = realItems.filter((i) => i.status === 'Vendu')
  const stock = realItems.filter((i) => i.status === 'En Attente' || i.status === 'En Stock' || i.status === 'Sur Vinted' || i.status === 'Partiellement vendu')

  const stockValue   = stock.reduce((s, i) => s + i.purchase_price + i.vinted_fees, 0)
  const totalSpent   = realItems.reduce((s, i) => s + i.purchase_price + i.vinted_fees, 0)
  const totalReceived = sold.reduce((s, i) => s + (i.actual_sale_price ?? 0) - i.sale_fees, 0)
  const cashInHand   = initialCapital - totalSpent + totalReceived
  const currentCapital = cashInHand + stockValue

  // Consommables
  const consumablesTotal = consumables.reduce((s, c) => s + c.price * (c.quantity ?? 1), 0)
  const consumablesByMonth: Record<string, number> = {}
  consumables.forEach((c) => {
    const key = c.date.slice(0, 7)
    consumablesByMonth[key] = (consumablesByMonth[key] ?? 0) + c.price * (c.quantity ?? 1)
  })
  const monthValues = Object.values(consumablesByMonth)
  const avgMonthlyConsumables = monthValues.length > 0
    ? monthValues.reduce((a, b) => a + b, 0) / monthValues.length
    : 0

  // Financement perso
  const romainContribution = realItems
    .filter((i) => i.funded_by === 'ROMAIN_PERSO')
    .reduce((s, i) => s + i.purchase_price, 0)
  const celianContribution = realItems
    .filter((i) => i.funded_by === 'CELIAN_PERSO')
    .reduce((s, i) => s + i.purchase_price, 0)

  // Bénéfice net
  const netProfit = sold.reduce((s, i) => {
    const cost = i.purchase_price + i.vinted_fees + i.boost_cost
    return s + (i.actual_sale_price ?? 0) - i.sale_fees - cost
  }, 0) - consumablesTotal

  // ROI moyen
  const roiValues = sold
    .map((i) => {
      const cost = i.purchase_price + i.vinted_fees + i.boost_cost
      if (cost === 0 || i.actual_sale_price === null) return null
      return ((i.actual_sale_price - i.sale_fees - cost) / cost) * 100
    })
    .filter((v): v is number => v !== null)

  const avgROI = roiValues.length > 0
    ? roiValues.reduce((a, b) => a + b, 0) / roiValues.length
    : 0

  // Valeur estimée stock + hits
  const stockHits = items.filter((i) => i.is_hit && (i.status === 'En Attente' || i.status === 'En Stock' || i.status === 'Sur Vinted' || i.status === 'Partiellement vendu'))
  const pendingValue = [...stock, ...stockHits].reduce((s, i) => {
    if (i.expected_sale_price) return s + i.expected_sale_price
    return s
  }, 0)

  const delays = sold
    .filter((i) => i.sold_at)
    .map((i) => {
      const start = i.posted_at ?? i.created_at
      return (new Date(i.sold_at!).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
    })
  const avgSellDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null

  const stockValueCelian = stock
    .filter((i) => i.location === 'Chez Célian')
    .reduce((s, i) => s + i.purchase_price + i.vinted_fees, 0)
  const stockValueRomain = stock
    .filter((i) => i.location === 'Chez Romain')
    .reduce((s, i) => s + i.purchase_price + i.vinted_fees, 0)

  return {
    currentCapital, cashInHand, stockValue, netProfit, avgROI,
    stockCount: stock.length, soldCount: sold.length, pendingValue,
    avgSellDelay, stockValueCelian, stockValueRomain,
    romainContribution, celianContribution,
    consumablesTotal, avgMonthlyConsumables,
  }
}

export function formatCurrency(v: number, showSign = false): string {
  const abs = Math.abs(v)
  const formatted = abs.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (showSign) return `${v >= 0 ? '+' : '-'}${formatted}€`
  return `${formatted}€`
}

export function formatROI(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

export function roiColor(v: number | null, roiTarget = ROI_TARGET): string {
  if (v === null) return 'text-zinc-500'
  if (v >= roiTarget) return 'text-emerald-400'
  if (v >= roiTarget / 2) return 'text-amber-400'
  return 'text-red-400'
}
