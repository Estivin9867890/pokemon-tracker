import { ID, Models, Query } from 'appwrite'

function normalizeBrand(b: string): string {
  return b.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
import { databases, DATABASE_ID, COLLECTION_ID } from './appwrite'
import { Category, InventoryItem, ItemFormData, Location, Status } from '@/types'

function docToItem(doc: Models.Document): InventoryItem {
  return {
    id: doc.$id,
    created_at: doc.$createdAt,
    item_name: doc.item_name,
    brand: doc.brand ?? '',
    purchase_price: doc.purchase_price,
    vinted_fees: doc.vinted_fees,
    expected_sale_price: doc.expected_sale_price ?? null,
    actual_sale_price: doc.actual_sale_price ?? null,
    sale_fees: doc.sale_fees ?? 0,
    boost_cost: doc.boost_cost ?? 0,
    location: doc.location as Location,
    status: doc.status as Status,
    posted_at: doc.posted_at ?? null,
    sold_at: doc.sold_at ?? null,
    notes: doc.notes ?? null,
    category: (doc.category as Category) ?? null,
    size: doc.size ?? null,
  }
}

export async function listItems(): Promise<InventoryItem[]> {
  const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
    Query.orderDesc('$createdAt'),
    Query.limit(200),
  ])
  return res.documents.map(docToItem)
}

export async function addItem(data: ItemFormData): Promise<InventoryItem> {
  const doc = await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
    item_name: data.item_name,
    brand: normalizeBrand(data.brand),
    purchase_price: parseFloat(data.purchase_price) || 0,
    vinted_fees: parseFloat(data.vinted_fees) || 0,
    expected_sale_price: data.expected_sale_price ? parseFloat(data.expected_sale_price) : null,
    actual_sale_price: null,
    sale_fees: 0,
    boost_cost: 0,
    location: data.location,
    status: 'En Attente',
    posted_at: null,
    sold_at: null,
    notes: data.notes || null,
    category: data.category ?? null,
    size: data.size || null,
  })
  return docToItem(doc)
}

export async function editItem(id: string, data: ItemFormData): Promise<InventoryItem> {
  const doc = await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
    item_name: data.item_name,
    brand: normalizeBrand(data.brand),
    purchase_price: parseFloat(data.purchase_price) || 0,
    vinted_fees: parseFloat(data.vinted_fees) || 0,
    expected_sale_price: data.expected_sale_price ? parseFloat(data.expected_sale_price) : null,
    location: data.location,
    notes: data.notes || null,
    category: data.category ?? null,
    size: data.size || null,
  })
  return docToItem(doc)
}

export async function markSold(
  id: string,
  actualPrice: number,
  saleFees: number,
  boostCost: number
): Promise<InventoryItem> {
  const doc = await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
    actual_sale_price: actualPrice,
    sale_fees: saleFees,
    boost_cost: boostCost,
    status: 'Vendu',
    sold_at: new Date().toISOString(),
  })
  return docToItem(doc)
}

export async function toggleVinted(id: string, currentStatus: string): Promise<InventoryItem> {
  const goingOnVinted = currentStatus !== 'Sur Vinted'
  const doc = await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
    status: goingOnVinted ? 'Sur Vinted' : 'En Stock',
    posted_at: goingOnVinted ? new Date().toISOString() : null,
  })
  return docToItem(doc)
}

export async function markReceived(id: string): Promise<InventoryItem> {
  const doc = await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
    status: 'En Stock',
  })
  return docToItem(doc)
}

export async function removeItem(id: string): Promise<void> {
  await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, id)
}
