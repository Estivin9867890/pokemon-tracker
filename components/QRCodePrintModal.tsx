'use client'

import { useRef, useState, useCallback } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import Modal from '@/components/ui/Modal'
import { InventoryItem } from '@/types'
import { Printer, Download, Layers, Filter } from 'lucide-react'

interface QRCodePrintModalProps {
  open: boolean
  onClose: () => void
  items: InventoryItem[]
}

type PrintFilter = 'all' | 'singles' | 'lots-hits'

function getLabel(item: InventoryItem): string {
  if (item.pokemon_name) return item.pokemon_name
  return item.item_name
}

function getSubLabel(item: InventoryItem): string {
  const parts: string[] = []
  if (item.card_number) parts.push(`#${item.card_number}`)
  if (item.extension) parts.push(item.extension)
  return parts.join(' · ')
}

export default function QRCodePrintModal({ open, onClose, items }: QRCodePrintModalProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<PrintFilter>('all')

  const printableItems = items.filter(i => {
    const inStock = i.status !== 'Vendu'
    if (!inStock) return false
    if (filter === 'singles') return !i.is_lot && !i.is_hit
    if (filter === 'lots-hits') return i.is_hit
    return !i.is_lot || i.is_hit
  })

  const singlesCount = items.filter(i => i.status !== 'Vendu' && !i.is_lot && !i.is_hit).length
  const hitsCount = items.filter(i => i.status !== 'Vendu' && i.is_hit).length

  const handlePrint = useCallback(() => {
    if (!printRef.current) return
    const win = window.open('', '_blank')
    if (!win) return

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Codes - Pokemon Stock</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; }
          .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            padding: 12px;
          }
          .card {
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            page-break-inside: avoid;
          }
          .card canvas { width: 80px !important; height: 80px !important; }
          .name { font-size: 8px; font-weight: 700; text-align: center; line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .sub { font-size: 7px; color: #666; text-align: center; }
          @media print {
            .grid { padding: 4mm; gap: 3mm; grid-template-columns: repeat(5, 1fr); }
            .card { padding: 3mm; }
          }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `)
    win.document.close()
  }, [])

  const handleDownloadAll = useCallback(() => {
    if (!printRef.current) return
    const canvases = printRef.current.querySelectorAll('canvas')
    if (canvases.length === 0) return

    const qrSize = 100
    const cellW = 120
    const cellH = 140
    const cols = 5
    const rows = Math.ceil(canvases.length / cols)
    const pad = 16

    const out = document.createElement('canvas')
    out.width = cols * cellW + pad * 2
    out.height = rows * cellH + pad * 2
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)

    canvases.forEach((canvas, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const x = pad + col * cellW + (cellW - qrSize) / 2
      const y = pad + row * cellH
      ctx.drawImage(canvas, x, y, qrSize, qrSize)

      const item = printableItems[idx]
      if (item) {
        ctx.fillStyle = '#000000'
        ctx.font = 'bold 9px Arial'
        ctx.textAlign = 'center'
        const cx = pad + col * cellW + cellW / 2
        ctx.fillText(getLabel(item).substring(0, 18), cx, y + qrSize + 12, cellW - 8)
        const sub = getSubLabel(item)
        if (sub) {
          ctx.font = '7px Arial'
          ctx.fillStyle = '#666666'
          ctx.fillText(sub.substring(0, 25), cx, y + qrSize + 22, cellW - 8)
        }
      }
    })

    const a = document.createElement('a')
    a.download = 'QR_Codes_Pokemon.png'
    a.href = out.toDataURL('image/png')
    a.click()
  }, [printableItems])

  return (
    <Modal open={open} onClose={onClose} title="Impression QR Codes" maxWidth="max-w-3xl">
      <div className="px-6 py-5">
        {/* Filters */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-1">
            {([
              { key: 'all' as const, label: 'Tout', count: singlesCount + hitsCount },
              { key: 'singles' as const, label: 'Singles', count: singlesCount },
              { key: 'lots-hits' as const, label: 'Hits (lots)', count: hitsCount, icon: <Layers size={10} /> },
            ]).map(({ key, label, count, icon }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  filter === key
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {icon}
                {label}
                <span className={`text-[10px] px-1 py-0.5 rounded-full ${filter === key ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-600'}`}>{count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAll}
              disabled={printableItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-colors border border-zinc-700/60 disabled:opacity-40"
            >
              <Download size={12} />
              Image
            </button>
            <button
              onClick={handlePrint}
              disabled={printableItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Printer size={12} />
              Imprimer ({printableItems.length})
            </button>
          </div>
        </div>

        {printableItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500">Aucune carte en stock pour ce filtre.</p>
          </div>
        ) : (
          <div
            ref={printRef}
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1"
          >
            {printableItems.map((item) => {
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard?card=${item.id}`
              return (
                <div key={item.id} className="card flex flex-col items-center gap-1.5 p-2 bg-white rounded-lg">
                  <QRCodeCanvas value={url} size={80} level="M" />
                  <p className="name text-[9px] font-bold text-black text-center leading-tight truncate w-full">
                    {getLabel(item)}
                  </p>
                  <p className="sub text-[7px] text-gray-500 text-center truncate w-full">
                    {getSubLabel(item)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
