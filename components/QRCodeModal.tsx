'use client'

import { useRef, useCallback } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import Modal from '@/components/ui/Modal'
import { InventoryItem } from '@/types'
import { Download, QrCode } from 'lucide-react'

interface QRCodeModalProps {
  open: boolean
  onClose: () => void
  item: InventoryItem | null
}

function buildLabel(item: InventoryItem): string {
  const parts: string[] = []
  if (item.pokemon_name) parts.push(item.pokemon_name)
  if (item.card_number) parts.push(`#${item.card_number}`)
  if (parts.length === 0) parts.push(item.item_name)
  return parts.join(' ')
}

export default function QRCodeModal({ open, onClose, item }: QRCodeModalProps) {
  const canvasRef = useRef<HTMLDivElement>(null)

  const handleDownload = useCallback(() => {
    if (!item || !canvasRef.current) return
    const canvas = canvasRef.current.querySelector('canvas')
    if (!canvas) return

    const pad = 20
    const labelH = 40
    const out = document.createElement('canvas')
    out.width = canvas.width + pad * 2
    out.height = canvas.height + pad * 2 + labelH
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, pad, pad)

    ctx.fillStyle = '#000000'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    const label = buildLabel(item)
    ctx.fillText(label, out.width / 2, canvas.height + pad + 20, out.width - 20)

    if (item.extension) {
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#666666'
      ctx.fillText(item.extension, out.width / 2, canvas.height + pad + 36, out.width - 20)
    }

    const a = document.createElement('a')
    const slug = (item.pokemon_name ?? item.item_name).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
    a.download = `QR_${slug}.png`
    a.href = out.toDataURL('image/png')
    a.click()
  }, [item])

  if (!item) return null

  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard?card=${item.id}`
  const label = buildLabel(item)

  return (
    <Modal open={open} onClose={onClose} title="QR Code" maxWidth="max-w-xs">
      <div className="px-6 py-6 flex flex-col items-center gap-4">
        <div ref={canvasRef} className="bg-white p-4 rounded-xl">
          <QRCodeCanvas value={url} size={200} level="M" />
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-white">{label}</p>
          {item.extension && (
            <p className="text-[11px] text-zinc-500 mt-0.5">{item.extension}</p>
          )}
        </div>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-bold transition-colors w-full justify-center"
        >
          <Download size={13} />
          Télécharger le QR Code
        </button>
      </div>
    </Modal>
  )
}
