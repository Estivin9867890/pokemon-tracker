import { supabase } from './supabase'
import { Consumable, ConsumableCategory, FundedBy, InventoryItem, ItemFormData, Location, Status } from '@/types'

type Row = Record<string, unknown>

function rowToItem(row: Row): InventoryItem {
  return {
    id:                   row.id as string,
    created_at:           row.created_at as string,
    item_name:            row.item_name as string,
    purchase_price:       row.purchase_price as number,
    vinted_fees:          (row.vinted_fees as number)          ?? 0,
    expected_sale_price:  (row.expected_sale_price as number)  ?? null,
    actual_sale_price:    (row.actual_sale_price as number)    ?? null,
    sale_fees:            (row.sale_fees as number)            ?? 0,
    boost_cost:           (row.boost_cost as number)           ?? 0,
    location:             row.location as Location,
    status:               row.status as Status,
    posted_at:            (row.posted_at as string)            ?? null,
    sold_at:              (row.sold_at as string)              ?? null,
    notes:                (row.notes as string)                ?? null,
    pokemon_name:         (row.pokemon_name as string)         ?? null,
    card_number:          (row.card_number as string)          ?? null,
    extension:            (row.extension as string)            ?? null,
    rarity:               (row.rarity as string)               ?? null,
    pokemon_category:     (row.pokemon_category as 'SINGLE' | 'SEALED') ?? null,
    poke_location:        (row.poke_location as 'CELIAN' | 'ROMAIN')    ?? null,
    is_graded:            (row.is_graded as boolean)           ?? false,
    grading_company:      (row.grading_company as string)      ?? null,
    grading_note:         (row.grading_note as number)         ?? null,
    lot_id:               (row.lot_id as string)               ?? null,
    is_lot:               (row.is_lot as boolean)              ?? false,
    lot_total_cost:       (row.lot_total_cost as number)       ?? null,
    item_count:           (row.item_count as number)           ?? null,
    items_sold:           (row.items_sold as number)           ?? null,
    revenue_generated:    (row.revenue_generated as number)    ?? null,
    funded_by:            (row.funded_by as FundedBy)          ?? null,
    is_hit:               (row.is_hit as boolean)              ?? false,
    parent_lot_id:        (row.parent_lot_id as string)        ?? null,
    received:             (row.received as boolean)            ?? false,
    is_sold:              (row.is_sold as boolean)             ?? false,
    sold_price:           (row.sold_price as number)           ?? null,
  }
}

function rowToConsumable(row: Row): Consumable {
  return {
    id:         row.id as string,
    created_at: row.created_at as string,
    name:       row.name as string,
    price:      row.price as number,
    quantity:   (row.quantity as number) ?? 1,
    date:       row.date as string,
    category:   (row.category as ConsumableCategory) ?? 'OTHER',
  }
}

function throwIf(error: unknown, msg: string) {
  if (error) throw new Error(`${msg}: ${(error as { message?: string }).message ?? error}`)
}

// ── Inventory ────────────────────────────────────────────

export async function listItems(): Promise<InventoryItem[]> {
  const PAGE = 1000
  const all: InventoryItem[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    throwIf(error, 'listItems')
    const page = (data ?? []).map(rowToItem)
    all.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function addItem(data: ItemFormData): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .insert({
      item_name:           data.pokemon_name || data.item_name,
      purchase_price:      parseFloat(data.purchase_price) || 0,
      vinted_fees:         parseFloat(data.vinted_fees) || 0,
      expected_sale_price: data.expected_sale_price ? parseFloat(data.expected_sale_price) : null,
      actual_sale_price:   null,
      sale_fees:           0,
      boost_cost:          0,
      location:            data.location,
      status:              'En Stock',
      notes:               data.notes || null,
      pokemon_name:        data.pokemon_name || null,
      card_number:         data.card_number || null,
      extension:           data.extension || null,
      rarity:              data.rarity || null,
      pokemon_category:    data.pokemon_category || null,
      poke_location:       data.poke_location || null,
      is_graded:           data.is_graded ?? false,
      grading_company:     data.grading_company || null,
      grading_note:        data.grading_note ? parseInt(data.grading_note) : null,
      lot_id:              null,
      is_lot:              false,
      funded_by:           data.funded_by ?? null,
      is_hit:              false,
      parent_lot_id:       null,
      received:            true,
      is_sold:             false,
      sold_price:          null,
    })
    .select()
    .single()
  throwIf(error, 'addItem')
  return rowToItem(row as Row)
}

export async function addLot(data: ItemFormData): Promise<InventoryItem[]> {
  const nbArticles = Math.max(1, parseInt(data.nb_articles) || 1)
  const totalCost  = parseFloat(data.lot_total_cost) || 0
  const itemName   = data.pokemon_name || data.item_name
  const lotId      = crypto.randomUUID()

  const { data: lotRow, error: lotErr } = await supabase
    .from('inventory')
    .insert({
      item_name:           itemName,
      purchase_price:      totalCost,
      vinted_fees:         0,
      expected_sale_price: data.expected_sale_price ? parseFloat(data.expected_sale_price) : null,
      actual_sale_price:   null,
      sale_fees:           0,
      boost_cost:          0,
      location:            data.location,
      status:              'En Stock',
      notes:               data.notes || null,
      pokemon_name:        data.pokemon_name || null,
      extension:           data.extension || null,
      rarity:              data.rarity || null,
      pokemon_category:    data.pokemon_category || null,
      poke_location:       data.poke_location || null,
      is_graded:           false,
      lot_id:              lotId,
      is_lot:              true,
      lot_total_cost:      totalCost,
      item_count:          nbArticles,
      funded_by:           data.funded_by ?? null,
      is_hit:              false,
      parent_lot_id:       null,
      received:            false,
      is_sold:             false,
      sold_price:          null,
    })
    .select()
    .single()
  throwIf(lotErr, 'addLot (parent)')

  const results: InventoryItem[] = [rowToItem(lotRow as Row)]

  for (const hit of (data.hits ?? [])) {
    if (!hit.pokemon_name.trim()) continue
    const { data: hitRow, error: hitErr } = await supabase
      .from('inventory')
      .insert({
        item_name:           hit.pokemon_name,
        purchase_price:      0,
        vinted_fees:         0,
        expected_sale_price: hit.estimated_value ? parseFloat(hit.estimated_value) : null,
        actual_sale_price:   null,
        sale_fees:           0,
        boost_cost:          0,
        location:            data.location,
        status:              'En Stock',
        pokemon_name:        hit.pokemon_name,
        card_number:         hit.card_number || null,
        extension:           data.extension || null,
        pokemon_category:    data.pokemon_category || null,
        poke_location:       data.poke_location || null,
        is_graded:           false,
        is_lot:              false,
        funded_by:           data.funded_by ?? null,
        is_hit:              true,
        parent_lot_id:       lotId,
        received:            false,
        is_sold:             false,
        sold_price:          null,
      })
      .select()
      .single()
    throwIf(hitErr, 'addLot (hit)')
    results.push(rowToItem(hitRow as Row))
  }

  return results
}

export async function editLot(id: string, data: ItemFormData): Promise<{ updated: InventoryItem[]; deletedIds: string[] }> {
  const totalCost  = parseFloat(data.lot_total_cost) || 0
  const nbArticles = Math.max(1, parseInt(data.nb_articles) || 1)
  const lotId      = data.lot_id!

  // Vérifier si la réduction de item_count rend le lot complet
  const { data: current, error: fetchErr } = await supabase
    .from('inventory').select('items_sold').eq('id', id).single()
  throwIf(fetchErr, 'editLot (fetch current)')
  const currentSold    = ((current as Row)?.items_sold as number) ?? 0
  const isNowFullySold = nbArticles > 0 && currentSold >= nbArticles

  // 1. Mettre à jour le parent
  const { data: parentRow, error: parentErr } = await supabase
    .from('inventory')
    .update({
      item_name:      data.pokemon_name || data.item_name,
      purchase_price: totalCost,
      lot_total_cost: totalCost,
      item_count:     nbArticles,
      extension:      data.extension || null,
      notes:          data.notes || null,
      location:       data.location,
      funded_by:      data.funded_by ?? null,
      expected_sale_price: data.expected_sale_price ? parseFloat(data.expected_sale_price) : null,
      ...(isNowFullySold ? { status: 'Vendu', sold_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .select()
    .single()
  throwIf(parentErr, 'editLot (parent)')
  const updated: InventoryItem[] = [rowToItem(parentRow as Row)]

  // 2. Supprimer les hits retirés
  const deletedIds = data.deletedHitIds ?? []
  for (const hitId of deletedIds) {
    const { error } = await supabase.from('inventory').delete().eq('id', hitId)
    throwIf(error, 'editLot (delete hit)')
  }

  // 3. Mettre à jour / créer les hits
  for (const hit of (data.hits ?? [])) {
    if (!hit.pokemon_name.trim()) continue
    if (hit.id) {
      const { data: hitRow, error: hitErr } = await supabase
        .from('inventory')
        .update({
          item_name:           hit.pokemon_name,
          pokemon_name:        hit.pokemon_name,
          card_number:         hit.card_number || null,
          expected_sale_price: hit.estimated_value ? parseFloat(hit.estimated_value) : null,
        })
        .eq('id', hit.id)
        .select()
        .single()
      throwIf(hitErr, 'editLot (update hit)')
      updated.push(rowToItem(hitRow as Row))
    } else {
      const { data: hitRow, error: hitErr } = await supabase
        .from('inventory')
        .insert({
          item_name:           hit.pokemon_name,
          purchase_price:      0,
          vinted_fees:         0,
          expected_sale_price: hit.estimated_value ? parseFloat(hit.estimated_value) : null,
          actual_sale_price:   null,
          sale_fees:           0,
          boost_cost:          0,
          location:            data.location,
          status:              'En Stock',
          pokemon_name:        hit.pokemon_name,
          card_number:         hit.card_number || null,
          extension:           data.extension || null,
          pokemon_category:    data.pokemon_category || null,
          poke_location:       data.poke_location || null,
          is_graded:           false,
          is_lot:              false,
          funded_by:           data.funded_by ?? null,
          is_hit:              true,
          parent_lot_id:       lotId,
          received:            false,
          is_sold:             false,
          sold_price:          null,
        })
        .select()
        .single()
      throwIf(hitErr, 'editLot (create hit)')
      updated.push(rowToItem(hitRow as Row))
    }
  }

  return { updated, deletedIds }
}

export async function editItem(id: string, data: ItemFormData): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .update({
      item_name:           data.pokemon_name || data.item_name,
      purchase_price:      parseFloat(data.purchase_price) || 0,
      vinted_fees:         parseFloat(data.vinted_fees) || 0,
      expected_sale_price: data.expected_sale_price ? parseFloat(data.expected_sale_price) : null,
      location:            data.location,
      notes:               data.notes || null,
      pokemon_name:        data.pokemon_name || null,
      card_number:         data.card_number || null,
      extension:           data.extension || null,
      rarity:              data.rarity || null,
      pokemon_category:    data.pokemon_category || null,
      poke_location:       data.poke_location || null,
      is_graded:           data.is_graded ?? false,
      grading_company:     data.grading_company || null,
      grading_note:        data.grading_note ? parseInt(data.grading_note) : null,
      funded_by:           data.funded_by ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'editItem')
  return rowToItem(row as Row)
}

export async function markSold(id: string, actualPrice: number, saleFees: number, boostCost: number): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .update({
      actual_sale_price: actualPrice,
      sale_fees:         saleFees,
      boost_cost:        boostCost,
      status:            'Vendu',
      sold_at:           new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'markSold')
  return rowToItem(row as Row)
}

export async function sellLotPartial(id: string, itemsSold: number, revenueGenerated: number, itemCount: number): Promise<InventoryItem> {
  const isFullySold = itemsSold >= itemCount
  const { data: row, error } = await supabase
    .from('inventory')
    .update({
      items_sold:        itemsSold,
      revenue_generated: revenueGenerated,
      status:            isFullySold ? 'Vendu' : 'Partiellement vendu',
      sold_at:           isFullySold ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'sellLotPartial')
  return rowToItem(row as Row)
}

export async function toggleVinted(id: string, currentStatus: string): Promise<InventoryItem> {
  const goingOnVinted = currentStatus !== 'Sur Vinted'
  const { data: row, error } = await supabase
    .from('inventory')
    .update({
      status:    goingOnVinted ? 'Sur Vinted' : 'En Stock',
      posted_at: goingOnVinted ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'toggleVinted')
  return rowToItem(row as Row)
}

export async function markReceived(id: string): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .update({ status: 'En Stock', received: true })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'markReceived')
  return rowToItem(row as Row)
}

export async function markHitSold(hitId: string, soldPrice: number): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .update({ is_sold: true, sold_price: soldPrice, actual_sale_price: soldPrice, status: 'Vendu', sold_at: new Date().toISOString() })
    .eq('id', hitId)
    .select()
    .single()
  throwIf(error, 'markHitSold')
  return rowToItem(row as Row)
}

export async function patchSalePrice(id: string, actualSalePrice: number): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .update({ actual_sale_price: actualSalePrice, sold_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'patchSalePrice')
  return rowToItem(row as Row)
}

export async function restoreToStock(id: string): Promise<InventoryItem> {
  const { data: row, error } = await supabase
    .from('inventory')
    .update({
      status:            'En Stock',
      sold_at:           null,
      actual_sale_price: null,
      revenue_generated: null,
      items_sold:        null,
    })
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'restoreToStock')
  return rowToItem(row as Row)
}

export async function removeItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory').delete().eq('id', id)
  throwIf(error, 'removeItem')
}

// ── Consumables ──────────────────────────────────────────

export async function listConsumables(): Promise<Consumable[]> {
  const { data, error } = await supabase
    .from('consumables')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  throwIf(error, 'listConsumables')
  return (data ?? []).map(rowToConsumable)
}

export async function addConsumable(data: { name: string; price: number; quantity: number; date: string; category: ConsumableCategory }): Promise<Consumable> {
  const { data: row, error } = await supabase
    .from('consumables')
    .insert(data)
    .select()
    .single()
  throwIf(error, 'addConsumable')
  return rowToConsumable(row as Row)
}

export async function editConsumable(id: string, data: { name: string; price: number; quantity: number; date: string; category: ConsumableCategory }): Promise<Consumable> {
  const { data: row, error } = await supabase
    .from('consumables')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  throwIf(error, 'editConsumable')
  return rowToConsumable(row as Row)
}

export async function removeConsumable(id: string): Promise<void> {
  const { error } = await supabase.from('consumables').delete().eq('id', id)
  throwIf(error, 'removeConsumable')
}

// Retro-fix : archive tous les lots dont items_sold >= item_count mais non encore archivés
export async function archiveCompletedLots(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('is_lot', true)
    .not('items_sold', 'is', null)
    .not('item_count', 'is', null)
  throwIf(error, 'archiveCompletedLots (fetch)')

  const toArchive = (data ?? []).filter((row: Row) =>
    row.status !== 'Vendu' &&
    (row.items_sold as number) >= (row.item_count as number)
  )
  if (toArchive.length === 0) return []

  const updated: InventoryItem[] = []
  for (const lot of toArchive) {
    const { data: updatedRow, error: updErr } = await supabase
      .from('inventory')
      .update({ status: 'Vendu', sold_at: new Date().toISOString() })
      .eq('id', lot.id as string)
      .select()
      .single()
    throwIf(updErr, `archiveCompletedLots (update ${lot.id})`)
    updated.push(rowToItem(updatedRow as Row))
  }
  return updated
}
