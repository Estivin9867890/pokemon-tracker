import { Consumable, InventoryItem, ItemWithCalc, DashboardStats } from '@/types'

export const INITIAL_CAPITAL = 200
export const ROI_TARGET = 30

export function calcItem(item: InventoryItem): ItemWithCalc {
  // Pour les hits : coût = prix d'achat estimé (expected_sale_price)
  const cost_basis = item.is_hit
    ? (item.expected_sale_price ?? 0)
    : item.purchase_price + item.vinted_fees + item.boost_cost

  let margin_net: number | null = null
  let roi_percent: number | null = null

  if (item.is_hit) {
    if (item.actual_sale_price != null) {
      margin_net = item.actual_sale_price - item.sale_fees - cost_basis
      roi_percent = cost_basis > 0 ? parseFloat(((margin_net / cost_basis) * 100).toFixed(1)) : null
    }
    return { ...item, cost_basis, margin_net, roi_percent }
  }

  // Pour les lots, utiliser revenue_generated comme prix de vente réel
  const saleRevenue = item.is_lot && item.revenue_generated != null
    ? item.revenue_generated
    : item.actual_sale_price

  if (saleRevenue !== null) {
    margin_net = saleRevenue - item.sale_fees - cost_basis
    roi_percent = item.purchase_price > 0 ? parseFloat(((margin_net / item.purchase_price) * 100).toFixed(1)) : null
  } else if (item.expected_sale_price !== null) {
    margin_net = item.expected_sale_price - cost_basis
    roi_percent = item.purchase_price > 0 ? parseFloat(((margin_net / item.purchase_price) * 100).toFixed(1)) : null
  }

  return { ...item, cost_basis, margin_net, roi_percent }
}

export function calcStats(items: InventoryItem[], initialCapital = INITIAL_CAPITAL, consumables: Consumable[] = [], owedRomain = 0, owedCelian = 0): DashboardStats {
  const realItems = items.filter((i) => !i.is_hit && !(i.lot_id !== null && !i.is_lot))

  const sold  = realItems.filter((i) => i.status === 'Vendu')
  const stock = realItems.filter((i) => i.status === 'En Attente' || i.status === 'En Stock' || i.status === 'Sur Vinted' || i.status === 'Partiellement vendu')

  // StockValue : coût d'achat réel de tout le stock (lots inclus, coût engagé)
  const stockValue = stock.reduce((s, i) => s + i.purchase_price, 0)

  // Hits vendus groupés par lot parent (pour calcul de profit par hit)
  const soldHitsByParent = items
    .filter(i => i.is_hit && i.actual_sale_price != null)
    .reduce((acc, h) => {
      if (h.parent_lot_id) {
        if (!acc[h.parent_lot_id]) acc[h.parent_lot_id] = []
        acc[h.parent_lot_id].push(h)
      }
      return acc
    }, {} as Record<string, InventoryItem[]>)

  // Profit d'un lot = Σ hits (prix vente réel − coût estimé) − frais vente lot
  const lotHitProfit = (lot: InventoryItem) => {
    const hits = soldHitsByParent[lot.lot_id ?? ''] ?? []
    return hits.reduce((s, h) => s + (h.actual_sale_price ?? 0) - (h.expected_sale_price ?? 0), 0) - lot.sale_fees
  }

  // Consommables
  const consumablesTotal = consumables.reduce((s, c) => s + c.price * (c.quantity ?? 1), 0)
  const consumablesByMonth: Record<string, number> = {}
  consumables.forEach((c) => {
    const key = c.date.slice(0, 7)
    consumablesByMonth[key] = (consumablesByMonth[key] ?? 0) + c.price * (c.quantity ?? 1)
  })
  const monthValues = Object.values(consumablesByMonth)
  const avgMonthlyConsumables = monthValues.length > 0
    ? monthValues.reduce((a, b) => a + b, 0) / monthValues.length : 0

  // ── Bénéfice net ────────────────────────────────────────────────────────────
  // Singles : comme avant (prix réel - frais - coût d'achat)
  // Lots : profit calculé hit par hit (prix réel vente - coût estimé par hit)
  const netProfit =
    // 1. Articles individuels vendus (non-lot)
    sold.filter(i => !i.is_lot).reduce((s, i) => {
      const cost = i.purchase_price + i.vinted_fees + i.boost_cost
      return s + (i.actual_sale_price ?? 0) - i.sale_fees - cost
    }, 0)
    // 2. Lots vendus : profit par hit
    + sold.filter(i => i.is_lot).reduce((s, lot) => s + lotHitProfit(lot), 0)
    // 3. Lots partiellement vendus avec hits déjà vendus
    + stock.filter(i => i.is_lot && (soldHitsByParent[i.lot_id ?? ''] ?? []).length > 0)
        .reduce((s, lot) => s + lotHitProfit(lot), 0)

  const cashInHand     = initialCapital + netProfit - stockValue - consumablesTotal - owedRomain - owedCelian
  const currentCapital = cashInHand + stockValue

  // Financement perso
  const romainContribution = realItems.filter(i => i.funded_by === 'ROMAIN_PERSO').reduce((s, i) => s + i.purchase_price, 0)
  const celianContribution = realItems.filter(i => i.funded_by === 'CELIAN_PERSO').reduce((s, i) => s + i.purchase_price, 0)

  // ROI moyen
  const roiValues = [
    // Singles
    ...sold.filter(i => !i.is_lot && i.purchase_price > 0 && i.actual_sale_price != null).map(i => {
      const cost = i.purchase_price + i.vinted_fees + i.boost_cost
      return ((i.actual_sale_price! - i.sale_fees - cost) / i.purchase_price) * 100
    }),
    // Lots vendus : hitProfit / coût lot
    ...sold.filter(i => i.is_lot && i.purchase_price > 0 && (soldHitsByParent[i.lot_id ?? ''] ?? []).length > 0)
      .map(i => (lotHitProfit(i) / i.purchase_price) * 100),
    // Lots partiellement vendus
    ...stock.filter(i => i.is_lot && i.purchase_price > 0 && (soldHitsByParent[i.lot_id ?? ''] ?? []).length > 0)
      .map(i => (lotHitProfit(i) / i.purchase_price) * 100),
  ]
  const avgROI = roiValues.length > 0 ? roiValues.reduce((a, b) => a + b, 0) / roiValues.length : 0

  // Nb hits vendus
  const soldHitsCount = items.filter(i => i.is_hit && i.actual_sale_price != null).length

  // Valeur estimée stock : singles + lots (expected_sale_price = valeur prévue sur articles non-hits)
  const pendingValue = stock.reduce((s, i) => i.expected_sale_price ? s + i.expected_sale_price : s, 0)

  const delays = sold.filter(i => i.sold_at).map(i => {
    const start = i.posted_at ?? i.created_at
    return (new Date(i.sold_at!).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)
  })
  const avgSellDelay = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null

  const stockValueCelian = stock.filter(i => i.location === 'Chez Célian').reduce((s, i) => s + i.purchase_price, 0)
  const stockValueRomain = stock.filter(i => i.location === 'Chez Romain').reduce((s, i) => s + i.purchase_price, 0)

  // Comptage "industriel" : 1 hit = 1 article
  const stockCount =
    stock.filter((i) => !i.is_lot).length +
    stock.filter((i) => i.is_lot).reduce((s, i) => s + (i.item_count ?? 0), 0)

  return {
    currentCapital, cashInHand, stockValue, netProfit, avgROI,
    stockCount, soldCount: sold.length + soldHitsCount, pendingValue,
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
