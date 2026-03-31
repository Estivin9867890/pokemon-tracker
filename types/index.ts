export type Location = 'Chez Louis' | 'Chez Célian'
export type Status = 'En Attente' | 'En Stock' | 'Sur Vinted' | 'Vendu'
export type Category = 'Chaussure' | 'Vêtement'

export interface InventoryItem {
  id: string
  created_at: string
  item_name: string
  brand: string
  purchase_price: number
  vinted_fees: number
  expected_sale_price: number | null
  actual_sale_price: number | null
  sale_fees: number
  boost_cost: number
  location: Location
  status: Status
  posted_at: string | null
  sold_at: string | null
  notes: string | null
  category: Category | null
  size: string | null
}

export interface ItemWithCalc extends InventoryItem {
  cost_basis: number
  margin_net: number | null
  roi_percent: number | null
}

export interface DashboardStats {
  currentCapital: number
  cashInHand: number
  stockValue: number
  netProfit: number
  avgROI: number
  stockCount: number
  soldCount: number
  pendingValue: number
  avgSellDelay: number | null // jours
  stockValueLouis: number
  stockValueCelian: number
}

export interface AppSettings {
  initial_capital: number       // Capital de départ
  roi_target: number            // ROI minimum cible en %
  obj1_label: string            // Label objectif 1
  obj1_target: number           // Montant objectif 1
  obj2_label: string
  obj2_target: number
  obj3_label: string
  obj3_target: number
  default_vinted_fees: number   // Frais Vinted pré-remplis à l'ajout
}

export const DEFAULT_SETTINGS: AppSettings = {
  initial_capital: 200,
  roi_target: 30,
  obj1_label: '1 mois',
  obj1_target: 60,
  obj2_label: '3 mois',
  obj2_target: 240,
  obj3_label: '1 an',
  obj3_target: 4500,
  default_vinted_fees: 0,
}

// Form state pour ajout / édition
export interface ItemFormData {
  item_name: string
  brand: string
  purchase_price: string
  vinted_fees: string
  expected_sale_price: string
  location: Location
  notes: string
  category: Category | null
  size: string
}
