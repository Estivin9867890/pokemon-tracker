import type ExcelJSLib from 'exceljs'
import { InventoryItem, DashboardStats } from '@/types'

// ─── Couleurs ─────────────────────────────────────────────────────────────────
const C = {
  PURPLE_BG:    'FF2D1B69',
  PURPLE_DARK:  'FF1A0A2E',
  PURPLE_BD:    'FF7C3AED',
  PURPLE_LIGHT: 'FFA78BFA',
  WHITE:        'FFFFFFFF',
  GREEN:        'FF34D399',
  RED:          'FFEF4444',
  AMBER:        'FFFBBF24',
  BLUE:         'FF60A5FA',
  ZINC_100:     'FFD4D4D8',
  ZINC_600:     'FF71717A',
  ROW_DARK:     'FF0D0D12',
  ROW_LIGHT:    'FF111116',
  TITLE_BG:     'FF0A0A12',
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR')
}

function grading(item: InventoryItem): string {
  if (!item.is_graded || !item.grading_company) return 'Non gradé'
  return item.grading_note != null
    ? `${item.grading_company} ${item.grading_note}`
    : item.grading_company
}

// ─── Structure d'une ligne ────────────────────────────────────────────────────
interface Row {
  type:      string
  pokemon:   string
  card_no:   string
  extension: string
  rarity:    string
  grading:   string
  created:   string
  status:    string
  sold_at:   string
  purchase:  number | null
  sale:      number | null
  fees:      number | null
  profit:    number | null
  roi:       number | null
  lot_name:  string
}

// ─── Construction des lignes ──────────────────────────────────────────────────
function buildRows(items: InventoryItem[]): Row[] {
  const rows: Row[] = []

  for (const item of items) {
    if (item.is_hit) continue
    if (item.lot_id !== null && !item.is_lot) continue

    if (item.is_lot) {
      const hits = items.filter(
        (i) => i.is_hit && i.parent_lot_id === item.lot_id,
      )

      if (hits.length > 0) {
        for (const h of hits) {
          const cost   = h.expected_sale_price ?? 0
          const sale   = h.actual_sale_price ?? null
          const fees   = h.sale_fees ?? 0
          const profit = sale !== null ? sale - fees - cost : null
          const roi    = profit !== null && cost > 0 ? (profit / cost) * 100 : null
          rows.push({
            type:      'Hit de Lot',
            pokemon:   h.pokemon_name   ?? '',
            card_no:   h.card_number    ?? '',
            extension: h.extension      ?? item.extension ?? '',
            rarity:    h.rarity         ?? '',
            grading:   grading(h),
            created:   fmtDate(h.created_at),
            status:    h.is_sold ? 'Vendu' : 'En Stock',
            sold_at:   fmtDate(h.sold_at),
            purchase:  cost  || null,
            sale,
            fees:      fees || null,
            profit,
            roi,
            lot_name:  item.item_name,
          })
        }
      } else {
        const cost   = item.purchase_price
        const fees   = item.vinted_fees + item.boost_cost + item.sale_fees
        const sale   = item.revenue_generated ?? item.actual_sale_price ?? null
        const profit = sale !== null ? sale - cost - fees : null
        const roi    = profit !== null && cost > 0 ? (profit / cost) * 100 : null
        rows.push({
          type:      'Lot',
          pokemon:   item.pokemon_name ?? item.item_name,
          card_no:   '',
          extension: item.extension   ?? '',
          rarity:    item.rarity      ?? '',
          grading:   grading(item),
          created:   fmtDate(item.created_at),
          status:    item.status,
          sold_at:   fmtDate(item.sold_at),
          purchase:  cost || null,
          sale,
          fees:      fees || null,
          profit,
          roi,
          lot_name:  '',
        })
      }
    } else {
      const cost   = item.purchase_price
      const fees   = item.vinted_fees + item.boost_cost + item.sale_fees
      const sale   = item.actual_sale_price ?? null
      const profit = sale !== null ? sale - cost - fees : null
      const roi    = profit !== null && cost > 0 ? (profit / cost) * 100 : null
      rows.push({
        type:      'Unité',
        pokemon:   item.pokemon_name ?? item.item_name,
        card_no:   item.card_number  ?? '',
        extension: item.extension    ?? '',
        rarity:    item.rarity       ?? '',
        grading:   grading(item),
        created:   fmtDate(item.created_at),
        status:    item.status,
        sold_at:   fmtDate(item.sold_at),
        purchase:  cost || null,
        sale,
        fees:      fees || null,
        profit,
        roi,
        lot_name:  '',
      })
    }
  }

  return rows
}

// ─── Helpers feuille RÉSUMÉ ────────────────────────────────────────────────────
type WS = ExcelJSLib.Worksheet

function addSectionHeader(ws: WS, title: string) {
  const r = ws.addRow([title])
  r.height = 22
  const c1 = r.getCell(1)
  c1.font   = { bold: true, size: 11, name: 'Calibri', color: { argb: C.PURPLE_LIGHT } }
  c1.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PURPLE_DARK } }
  c1.border = { bottom: { style: 'thin', color: { argb: C.PURPLE_BD } } }
  r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PURPLE_DARK } }
  r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PURPLE_DARK } }
}

function addDataRow(
  ws: WS,
  label: string,
  value: number | string,
  unit: string,
  isFinancial = false,
) {
  const r = ws.addRow([label, value, unit])
  r.height = 20
  r.getCell(1).font  = { size: 10, name: 'Calibri', color: { argb: C.ZINC_100 } }
  r.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ROW_DARK } }
  r.getCell(3).font  = { size: 10, name: 'Calibri', color: { argb: C.ZINC_600 } }
  r.getCell(3).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ROW_DARK } }
  const vc  = r.getCell(2)
  vc.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ROW_DARK } }
  if (typeof value === 'number') {
    vc.numFmt = unit === '%' ? '#,##0.0' : '#,##0.00'
    const argb = isFinancial ? (value >= 0 ? C.GREEN : C.RED) : C.ZINC_100
    vc.font   = { bold: true, size: 11, name: 'Calibri', color: { argb: argb } }
  } else {
    vc.font   = { bold: true, size: 11, name: 'Calibri', color: { argb: C.ZINC_100 } }
  }
}

// ─── Export principal ─────────────────────────────────────────────────────────
export async function exportToExcel(
  items: InventoryItem[],
  stats: DashboardStats,
  consumablesTotal: number,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Pokémon Tracker'
  wb.created = new Date()

  // ═══════════════════════════════════════════════════════════════════
  //  FEUILLE 1 — LISTING COMPLET
  // ═══════════════════════════════════════════════════════════════════
  const ws = wb.addWorksheet('LISTING COMPLET', {
    views:      [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: C.PURPLE_BD } },
  })

  ws.columns = [
    { header: 'Type',               key: 'type',      width: 13 },
    { header: 'Pokémon',            key: 'pokemon',   width: 22 },
    { header: 'N° Carte',           key: 'card_no',   width: 11 },
    { header: 'Extension',          key: 'extension', width: 24 },
    { header: 'Rareté',             key: 'rarity',    width: 20 },
    { header: 'Grading',            key: 'grading',   width: 13 },
    { header: "Date d'ajout",       key: 'created',   width: 12 },
    { header: 'Statut',             key: 'status',    width: 18 },
    { header: 'Date de vente',      key: 'sold_at',   width: 13 },
    { header: "Prix d'achat (€)",   key: 'purchase',  width: 15 },
    { header: 'Prix de vente (€)',  key: 'sale',      width: 15 },
    { header: 'Frais (€)',          key: 'fees',      width: 11 },
    { header: 'Bénéfice Net (€)',   key: 'profit',    width: 15 },
    { header: 'ROI (%)',            key: 'roi',       width: 10 },
    { header: "Lot d'origine",      key: 'lot_name',  width: 26 },
  ]

  // En-têtes stylisés
  const hdr = ws.getRow(1)
  hdr.height = 24
  hdr.eachCell((cell) => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PURPLE_BG } }
    cell.font      = { bold: true, color: { argb: C.WHITE }, size: 10, name: 'Calibri' }
    cell.border    = { bottom: { style: 'medium', color: { argb: C.PURPLE_BD } } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  ws.autoFilter = { from: 'A1', to: 'O1' }

  // Lignes de données
  const rows = buildRows(items)

  rows.forEach((rowData, idx) => {
    const r = ws.addRow([
      rowData.type, rowData.pokemon, rowData.card_no, rowData.extension,
      rowData.rarity, rowData.grading, rowData.created, rowData.status,
      rowData.sold_at, rowData.purchase, rowData.sale,
      rowData.fees, rowData.profit, rowData.roi, rowData.lot_name,
    ])
    r.height = 18

    const bg = idx % 2 === 0 ? C.ROW_DARK : C.ROW_LIGHT
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > 15) return
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.font      = { size: 10, name: 'Calibri', color: { argb: C.ZINC_100 } }
      cell.alignment = { vertical: 'middle' }
    })

    // Formats numériques colonnes financières (J=10, K=11, L=12, M=13)
    ;[10, 11, 12, 13].forEach((c) => { r.getCell(c).numFmt = '#,##0.00' })
    r.getCell(14).numFmt = '#,##0.0'

    // Couleurs profit / ROI
    if (rowData.profit !== null) {
      r.getCell(13).font = {
        bold: true, size: 10, name: 'Calibri',
        color: { argb: rowData.profit >= 0 ? C.GREEN : C.RED },
      }
    }
    if (rowData.roi !== null) {
      r.getCell(14).font = {
        size: 10, name: 'Calibri',
        color: { argb: rowData.roi >= 0 ? C.GREEN : C.RED },
      }
    }

    // Couleur colonne Type
    const typeColor = rowData.type === 'Hit de Lot' ? C.PURPLE_LIGHT
      : rowData.type === 'Lot' ? C.BLUE : C.AMBER
    r.getCell(1).font = { size: 10, name: 'Calibri', color: { argb: typeColor } }
  })

  // Ligne TOTAL
  if (rows.length > 0) {
    ws.addRow([])

    const validRoi = rows.filter((r) => r.roi !== null)
    const avgRoi   = validRoi.length > 0
      ? validRoi.reduce((s, r) => s + (r.roi ?? 0), 0) / validRoi.length
      : null

    const tot = ws.addRow([
      'TOTAL', '', '', '', '', '', '', '', '',
      rows.reduce((s, r) => s + (r.purchase ?? 0), 0),
      rows.reduce((s, r) => s + (r.sale     ?? 0), 0),
      rows.reduce((s, r) => s + (r.fees     ?? 0), 0),
      rows.reduce((s, r) => s + (r.profit   ?? 0), 0),
      avgRoi, '',
    ])
    tot.height = 22
    tot.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > 15) return
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.PURPLE_BG } }
      cell.font   = { bold: true, size: 10, name: 'Calibri', color: { argb: C.WHITE } }
      cell.border = { top: { style: 'medium', color: { argb: C.PURPLE_BD } } }
    })
    ;[10, 11, 12, 13].forEach((c) => { tot.getCell(c).numFmt = '#,##0.00' })
    tot.getCell(14).numFmt = '#,##0.0'
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FEUILLE 2 — RÉSUMÉ
  // ═══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('RÉSUMÉ', {
    properties: { tabColor: { argb: C.GREEN } },
  })
  ws2.columns = [
    { key: 'label', width: 42 },
    { key: 'value', width: 18 },
    { key: 'unit',  width:  8 },
  ]

  // Titre
  const titleRow = ws2.addRow(['🃏 BILAN POKÉMON — CÉLIAN & ROMAIN'])
  titleRow.height = 34
  ws2.mergeCells(`A${titleRow.number}:C${titleRow.number}`)
  titleRow.getCell(1).font      = { bold: true, size: 15, name: 'Calibri', color: { argb: C.PURPLE_LIGHT } }
  titleRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.TITLE_BG } }
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  const subRow = ws2.addRow([
    `Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  ])
  subRow.height = 18
  ws2.mergeCells(`A${subRow.number}:C${subRow.number}`)
  subRow.getCell(1).font      = { italic: true, size: 10, name: 'Calibri', color: { argb: C.ZINC_600 } }
  subRow.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.TITLE_BG } }
  subRow.getCell(1).alignment = { horizontal: 'center' }

  // Calculs globaux
  const totalCA      = rows.reduce((s, r) => s + (r.sale   ?? 0), 0)
  const totalFees    = rows.reduce((s, r) => s + (r.fees   ?? 0), 0)
  const totalBrut    = rows.reduce((s, r) => s + (r.profit ?? 0), 0)
  const totalNetReel = totalBrut - consumablesTotal

  // ── Finances ──
  ws2.addRow([])
  addSectionHeader(ws2, '💰 FINANCES')
  addDataRow(ws2, 'CA Total (ventes réalisées)',        totalCA,          '€', true)
  addDataRow(ws2, 'Frais totaux (Vinted + Boost)',      totalFees,        '€', true)
  addDataRow(ws2, 'Bénéfice Brut',                      totalBrut,        '€', true)
  addDataRow(ws2, 'Coût Logistique (emballages/envois)',consumablesTotal, '€', true)
  addDataRow(ws2, 'Bénéfice Net Réel',                  totalNetReel,     '€', true)

  // ── Stock ──
  ws2.addRow([])
  addSectionHeader(ws2, '📦 STOCK')
  addDataRow(ws2, "Valeur Stock Restant (coût d'achat)", stats.stockValue,     '€')
  addDataRow(ws2, 'Valeur Estimée du Stock',             stats.pendingValue,   '€')
  addDataRow(ws2, 'Cash Disponible',                     stats.cashInHand,     '€', true)
  addDataRow(ws2, 'Capital Total',                       stats.currentCapital, '€', true)

  // ── Performance ──
  ws2.addRow([])
  addSectionHeader(ws2, '📊 PERFORMANCE')
  addDataRow(ws2, 'ROI Moyen',            stats.avgROI,    '%')
  addDataRow(ws2, 'Nb articles en stock', stats.stockCount,'articles')
  addDataRow(ws2, 'Nb articles vendus',   stats.soldCount, 'ventes')
  addDataRow(ws2, 'Délai moyen de vente',
    stats.avgSellDelay != null ? Math.round(stats.avgSellDelay) : '—', 'jours')

  // ── Financement perso ──
  ws2.addRow([])
  addSectionHeader(ws2, '👥 FINANCEMENT PERSO')
  addDataRow(ws2, 'Apport Romain', stats.romainContribution, '€')
  addDataRow(ws2, 'Apport Célian', stats.celianContribution, '€')

  // ═══════════════════════════════════════════════════════════════════
  //  TÉLÉCHARGEMENT
  // ═══════════════════════════════════════════════════════════════════
  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  const now = new Date()
  a.href     = url
  a.download = `Pokemon_Bilan_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
