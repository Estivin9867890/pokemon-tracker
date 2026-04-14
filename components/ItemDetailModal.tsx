'use client'

import Modal from '@/components/ui/Modal'
import { InventoryItem } from '@/types'
import { calcItem, formatCurrency, formatROI, roiColor } from '@/lib/calculations'
import {
  MapPin, Tag, Clock, Package, TrendingUp, TrendingDown,
  CalendarDays, StickyNote, Zap, Sparkles, Layers,
} from 'lucide-react'

interface ItemDetailModalProps {
  open: boolean
  onClose: () => void
  item: InventoryItem | null
  roiTarget: number
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-xs text-zinc-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-white text-right">{children}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">{title}</p>
      <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-1">
        {children}
      </div>
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  'En Attente':          'bg-amber-400/10 text-amber-400 border-amber-400/20',
  'En Stock':            'bg-zinc-700/40 text-zinc-300 border-zinc-600/30',
  'Sur Vinted':          'bg-teal-400/10 text-teal-400 border-teal-400/20',
  'Vendu':               'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  'Partiellement vendu': 'bg-violet-400/10 text-violet-400 border-violet-400/20',
}

export default function ItemDetailModal({ open, onClose, item, roiTarget }: ItemDetailModalProps) {
  if (!item) return null
  const calc    = calcItem(item)
  const isSold  = item.status === 'Vendu'
  const estMargin = item.expected_sale_price != null
    ? item.expected_sale_price - calc.cost_basis
    : null

  return (
    <Modal open={open} onClose={onClose} title="Détail de l'article" maxWidth="max-w-md">
      <div className="px-6 py-5">

        {/* En-tête */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-base font-bold text-white leading-snug">{item.item_name}</h3>
            <span className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[item.status] ?? ''}`}>
              {item.status}
            </span>
          </div>
          {item.extension && (
            <p className="text-sm text-zinc-400">{item.extension}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {item.pokemon_category && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                item.pokemon_category === 'SINGLE'
                  ? 'bg-sky-400/10 text-sky-400 border-sky-400/20'
                  : 'bg-violet-400/10 text-violet-400 border-violet-400/20'
              }`}>
                {item.pokemon_category === 'SINGLE' ? '🃏 Carte' : '📦 Scellé'}
              </span>
            )}
            {item.rarity && (
              <span className="text-[11px] text-zinc-500">· {item.rarity}</span>
            )}
            {item.is_graded && item.grading_company && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
                🏅 {item.grading_company} {item.grading_note}
              </span>
            )}
            {item.is_lot && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-400/10 text-violet-400 border border-violet-400/20">
                <Layers size={9} />
                Lot · {item.item_count} cartes
              </span>
            )}
            {item.is_hit && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                <Sparkles size={9} />
                Hit
              </span>
            )}
          </div>
        </div>

        {/* Localisation */}
        <Section title="Localisation">
          <Row label="Chez">
            <span className={`flex items-center gap-1.5 justify-end ${item.location === 'Chez Romain' ? 'text-blue-400' : 'text-violet-400'}`}>
              <MapPin size={10} />
              {item.location}
            </span>
          </Row>
        </Section>

        {/* Achat */}
        <Section title="Achat">
          {item.is_lot ? (
            <>
              <Row label="Coût total lot">{formatCurrency(item.lot_total_cost ?? item.purchase_price)}</Row>
              {item.item_count && item.lot_total_cost && (
                <Row label="Coût / carte">{formatCurrency(item.lot_total_cost / item.item_count)}</Row>
              )}
            </>
          ) : (
            <>
              <Row label="Prix d'achat">{formatCurrency(item.purchase_price)}</Row>
              {item.card_number && (
                <Row label="Numéro de carte">
                  <span className="font-mono text-zinc-300">#{item.card_number}</span>
                </Row>
              )}
              {item.vinted_fees > 0 && (
                <Row label="Frais Vinted (achat)">{formatCurrency(item.vinted_fees)}</Row>
              )}
              <Row label="Coût total">
                <span className="text-zinc-300 font-bold">{formatCurrency(calc.cost_basis)}</span>
              </Row>
            </>
          )}
          {item.funded_by && item.funded_by !== 'CASH' && (
            <Row label="Acheté par">
              <span className="text-amber-400">{item.funded_by === 'ROMAIN_PERSO' ? 'Romain' : 'Célian'}</span>
            </Row>
          )}
        </Section>

        {/* Lot: progression */}
        {item.is_lot && (
          <Section title="Progression du lot">
            <Row label="Vendues">{item.items_sold ?? 0} / {item.item_count ?? '—'}</Row>
            {(item.revenue_generated ?? 0) > 0 && (
              <Row label="Revenus encaissés">{formatCurrency(item.revenue_generated ?? 0)}</Row>
            )}
            {(item.lot_total_cost ?? 0) > 0 && (
              <Row label="Rentabilisé">
                <span className={(item.revenue_generated ?? 0) >= (item.lot_total_cost ?? 0) ? 'text-emerald-400' : 'text-red-400'}>
                  {(item.revenue_generated ?? 0) >= (item.lot_total_cost ?? 0)
                    ? `Oui ✓ (+${formatCurrency((item.revenue_generated ?? 0) - (item.lot_total_cost ?? 0))})`
                    : `Non (manque ${formatCurrency((item.lot_total_cost ?? 0) - (item.revenue_generated ?? 0))})`
                  }
                </span>
              </Row>
            )}
          </Section>
        )}

        {/* Vente estimée (si non vendu) */}
        {!isSold && item.expected_sale_price != null && !item.is_lot && (
          <Section title="Revente estimée">
            <Row label="Prix visé">{formatCurrency(item.expected_sale_price)}</Row>
            {estMargin !== null && (
              <Row label="Marge estimée">
                <span className={estMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {formatCurrency(estMargin, true)}
                </span>
              </Row>
            )}
            {calc.roi_percent !== null && (
              <Row label="ROI estimé">
                <span className={roiColor(calc.roi_percent, roiTarget)}>
                  {formatROI(calc.roi_percent)}
                  {calc.roi_percent >= roiTarget ? ' ✓' : ` (obj. ${roiTarget}%)`}
                </span>
              </Row>
            )}
          </Section>
        )}

        {/* Vente réelle (si vendu) */}
        {isSold && !item.is_lot && (
          <Section title="Vente réalisée">
            <Row label="Prix de vente">
              <span className="text-white font-bold">
                {item.actual_sale_price != null ? formatCurrency(item.actual_sale_price) : '—'}
              </span>
            </Row>
            {item.sale_fees > 0 && (
              <Row label="Frais de vente">{formatCurrency(item.sale_fees)}</Row>
            )}
            {item.boost_cost > 0 && (
              <Row label="Boost Vinted">
                <span className="flex items-center gap-1 justify-end text-amber-400">
                  <Zap size={10} />
                  {formatCurrency(item.boost_cost)}
                </span>
              </Row>
            )}
            <Row label="Marge nette">
              <span className={`font-bold flex items-center gap-1 justify-end ${(calc.margin_net ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(calc.margin_net ?? 0) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {calc.margin_net !== null ? formatCurrency(calc.margin_net, true) : '—'}
              </span>
            </Row>
            <Row label="ROI réel">
              <span className={`font-bold ${roiColor(calc.roi_percent, roiTarget)}`}>
                {formatROI(calc.roi_percent)}
              </span>
            </Row>
          </Section>
        )}

        {/* Dates */}
        <Section title="Dates">
          <Row label="Ajouté le">
            <span className="flex items-center gap-1.5 justify-end text-zinc-400">
              <CalendarDays size={10} />
              {formatDate(item.created_at)}
            </span>
          </Row>
          {item.posted_at && (
            <Row label="Mis sur Vinted">
              <span className="flex items-center gap-1.5 justify-end text-teal-400">
                <Tag size={10} />
                {formatDate(item.posted_at)}
              </span>
            </Row>
          )}
          {item.sold_at && (
            <Row label="Vendu le">
              <span className="flex items-center gap-1.5 justify-end text-emerald-400">
                <Clock size={10} />
                {formatDate(item.sold_at)}
              </span>
            </Row>
          )}
        </Section>

        {/* Notes */}
        {item.notes && (
          <Section title="Notes">
            <div className="py-2.5 flex gap-2">
              <StickyNote size={12} className="text-zinc-600 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-400 leading-relaxed">{item.notes}</p>
            </div>
          </Section>
        )}

      </div>
    </Modal>
  )
}
