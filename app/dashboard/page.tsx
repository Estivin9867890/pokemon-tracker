'use client'

import { useState, useMemo, useEffect } from 'react'
import { Consumable, InventoryItem, ItemFormData, AppSettings, DEFAULT_SETTINGS } from '@/types'
import { calcStats } from '@/lib/calculations'
import { listItems, addItem, addLot, editItem, markSold, markReceived, removeItem, toggleVinted, listConsumables, addConsumable, editConsumable, removeConsumable, sellLotPartial } from '@/lib/db'
import { getSettings, saveSettings } from '@/lib/settings'
import StatsBar from '@/components/StatsBar'
import LotTracker from '@/components/LotTracker'
import StockTab from '@/components/StockTab'
import ArchivesTab from '@/components/ArchivesTab'
import ObjectifsTab from '@/components/ObjectifsTab'
import TresorerieTab from '@/components/TresorerieTab'
import LogistiqueTab from '@/components/LogistiqueTab'
import StatsTab from '@/components/StatsTab'
import ItemDetailModal from '@/components/ItemDetailModal'
import AddEditModal from '@/components/AddEditModal'
import SellModal from '@/components/SellModal'
import LotSellModal from '@/components/LotSellModal'
import DeleteModal from '@/components/DeleteModal'
import SettingsModal from '@/components/SettingsModal'
import LogistiqueModal from '@/components/LogistiqueModal'
import { Plus, Package, Archive, Loader2, Target, PieChart, Settings, BarChart2, Layers, PackageOpen, Truck } from 'lucide-react'

type Tab = 'stock' | 'archives' | 'stats' | 'objectifs' | 'tresorerie' | 'logistique'

export default function DashboardPage() {
  const [items, setItems]           = useState<InventoryItem[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [settings, setSettings]     = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<Tab>('stock')

  // Modals
  const [addEditOpen, setAddEditOpen]     = useState(false)
  const [logistiqueOpen, setLogistiqueOpen] = useState(false)
  const [editItemState, setEditItemState] = useState<InventoryItem | null>(null)
  const [sellItem, setSellItem]           = useState<InventoryItem | null>(null)
  const [lotSellItem, setLotSellItem]     = useState<InventoryItem | null>(null)
  const [deleteItem, setDeleteItem]       = useState<InventoryItem | null>(null)
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [detailItem, setDetailItem]       = useState<InventoryItem | null>(null)

  const stats = useMemo(
    () => calcStats(items, settings.initial_capital, consumables),
    [items, settings.initial_capital, consumables]
  )

  useEffect(() => {
    Promise.all([
      listItems(),
      getSettings(),
      listConsumables().catch(() => [] as Consumable[]),
    ])
      .then(([fetchedItems, fetchedSettings, fetchedConsumables]) => {
        setItems(fetchedItems)
        setSettings(fetchedSettings)
        setConsumables(fetchedConsumables)
      })
      .catch((e) => setError(e.message ?? 'Erreur de connexion à la base de données'))
      .finally(() => setLoading(false))
  }, [])

  // --- Handlers ---
  async function handleSave(data: ItemFormData, id?: string) {
    if (id) {
      const updated = await editItem(id, data)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
    } else if (data.is_lot) {
      const created = await addLot(data)
      setItems((prev) => [...created, ...prev])
      setActiveTab('stock')
    } else {
      const created = await addItem(data)
      setItems((prev) => [created, ...prev])
      setActiveTab('stock')
    }
  }

  async function handleSell(actualPrice: number, saleFees: number, boostCost: number) {
    if (!sellItem) return
    const updated = await markSold(sellItem.id, actualPrice, saleFees, boostCost)
    setItems((prev) => prev.map((i) => (i.id === sellItem.id ? updated : i)))
    setActiveTab('archives')
  }

  async function handleLotSell(itemsSoldDelta: number, revenueDelta: number) {
    if (!lotSellItem) return
    const newSold    = (lotSellItem.items_sold ?? 0) + itemsSoldDelta
    const newRevenue = (lotSellItem.revenue_generated ?? 0) + revenueDelta
    const itemCount  = lotSellItem.item_count ?? 1
    const updated    = await sellLotPartial(lotSellItem.id, newSold, newRevenue, itemCount)
    setItems((prev) => prev.map((i) => (i.id === lotSellItem.id ? updated : i)))
    if (newSold >= itemCount) setActiveTab('archives')
  }

  async function handleMarkReceived(item: InventoryItem) {
    const updated = await markReceived(item.id)
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  async function handleToggleVinted(item: InventoryItem) {
    const updated = await toggleVinted(item.id, item.status)
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  async function handleDelete() {
    if (!deleteItem) return
    await removeItem(deleteItem.id)
    setItems((prev) => prev.filter((i) => i.id !== deleteItem.id))
  }

  async function handleAddConsumable(data: { name: string; price: number; quantity: number; date: string; category: import('@/types').ConsumableCategory }) {
    const created = await addConsumable(data)
    setConsumables((prev) => [created, ...prev])
  }

  async function handleEditConsumable(id: string, data: { name: string; price: number; quantity: number; date: string; category: import('@/types').ConsumableCategory }) {
    const updated = await editConsumable(id, data)
    setConsumables((prev) => prev.map((c) => (c.id === id ? updated : c)))
  }

  async function handleDeleteConsumable(id: string) {
    await removeConsumable(id)
    setConsumables((prev) => prev.filter((c) => c.id !== id))
  }

  function openEdit(item: InventoryItem) {
    setEditItemState(item)
    setAddEditOpen(true)
  }

  function closeAddEdit() {
    setAddEditOpen(false)
    setEditItemState(null)
  }

  const isVisible = (i: InventoryItem) => !i.is_hit && !(i.lot_id !== null && !i.is_lot)
  const stockCount = items.filter((i) => isVisible(i) && (i.status === 'En Attente' || i.status === 'En Stock' || i.status === 'Sur Vinted' || i.status === 'Partiellement vendu')).length
  const soldCount  = items.filter((i) => isVisible(i) && i.status === 'Vendu').length

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
              <Layers size={13} className="text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-white tracking-widest uppercase">Pokémon</span>
              <span className="text-[10px] text-zinc-600 hidden sm:block">Card Flipping · Célian &amp; Romain</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
              title="Paramètres"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={() => setLogistiqueOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-colors border border-zinc-700/60"
              title="Ajouter un achat logistique"
            >
              <PackageOpen size={13} />
              <span className="hidden sm:inline">Logistique</span>
            </button>
            <button
              onClick={() => { setEditItemState(null); setAddEditOpen(true) }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-bold transition-colors"
            >
              <Plus size={13} />
              <span>Ajouter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 size={20} className="text-zinc-600 animate-spin" />
          </div>
        ) : (
          <>
            <StatsBar stats={stats} settings={settings} items={items} onSaveSettings={setSettings} />

            {/* Suivi des Lots */}
            <LotTracker items={items} />

            <div className="flex items-center gap-2 -mt-2">
              <div className="h-px flex-1 bg-zinc-800/60" />
              <span className="text-[11px] text-zinc-700 px-2">
                Capital de départ : {settings.initial_capital}€ · Objectif marge : {settings.roi_target}% min
              </span>
              <div className="h-px flex-1 bg-zinc-800/60" />
            </div>

            <div>
              <div className="flex items-center gap-1 border-b border-zinc-800/80 mb-6 overflow-x-auto">
                <TabButton active={activeTab === 'stock'}       onClick={() => setActiveTab('stock')}       icon={Package}  label="Stock"         count={stockCount} />
                <TabButton active={activeTab === 'archives'}    onClick={() => setActiveTab('archives')}    icon={Archive}  label="Archives"      count={soldCount} />
                <TabButton active={activeTab === 'stats'}       onClick={() => setActiveTab('stats')}       icon={BarChart2} label="Statistiques" />
                <TabButton active={activeTab === 'objectifs'}   onClick={() => setActiveTab('objectifs')}   icon={Target}   label="Objectifs" />
                <TabButton active={activeTab === 'tresorerie'}  onClick={() => setActiveTab('tresorerie')}  icon={PieChart} label="Trésorerie" />
                <TabButton active={activeTab === 'logistique'}  onClick={() => setActiveTab('logistique')}  icon={Truck}    label="Logistique" count={consumables.length || undefined} />
              </div>

              {activeTab === 'stock' && (
                <StockTab
                  items={items}
                  roiTarget={settings.roi_target}
                  onSell={(item) => item.is_lot ? setLotSellItem(item) : setSellItem(item)}
                  onEdit={openEdit}
                  onDelete={(item) => setDeleteItem(item)}
                  onToggleVinted={handleToggleVinted}
                  onMarkReceived={handleMarkReceived}
                  onDetail={(item) => setDetailItem(item)}
                />
              )}
              {activeTab === 'archives' && (
                <ArchivesTab
                  items={items}
                  roiTarget={settings.roi_target}
                  onEdit={openEdit}
                  onDelete={(item) => setDeleteItem(item)}
                  onDetail={(item) => setDetailItem(item)}
                />
              )}
              {activeTab === 'stats'      && <StatsTab items={items} />}
              {activeTab === 'objectifs'  && <ObjectifsTab stats={stats} settings={settings} />}
              {activeTab === 'tresorerie' && <TresorerieTab stats={stats} />}
              {activeTab === 'logistique' && (
                <LogistiqueTab
                  consumables={consumables}
                  onAdd={() => setLogistiqueOpen(true)}
                  onEdit={handleEditConsumable}
                  onDelete={handleDeleteConsumable}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <ItemDetailModal
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        item={detailItem}
        roiTarget={settings.roi_target}
      />
      <AddEditModal
        open={addEditOpen}
        onClose={closeAddEdit}
        onSave={handleSave}
        item={editItemState}
        roiTarget={settings.roi_target}
        defaultVintedFees={settings.default_vinted_fees}
      />
      <SellModal
        open={!!sellItem}
        onClose={() => setSellItem(null)}
        onConfirm={handleSell}
        item={sellItem}
        roiTarget={settings.roi_target}
      />
      <LotSellModal
        open={!!lotSellItem}
        onClose={() => setLotSellItem(null)}
        item={lotSellItem}
        onConfirm={handleLotSell}
      />
      <DeleteModal
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        item={deleteItem}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={async (s) => { setSettings(s); await saveSettings(s) }}
      />
      <LogistiqueModal
        open={logistiqueOpen}
        onClose={() => setLogistiqueOpen(false)}
        onSave={handleAddConsumable}
      />
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  count?: number
}

function TabButton({ active, onClick, icon: Icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
        active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon size={14} />
      {label}
      {count !== undefined && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-600'
        }`}>
          {count}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />
      )}
    </button>
  )
}
