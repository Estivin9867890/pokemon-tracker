export type Location = 'Chez Célian' | 'Chez Romain'
export type Status = 'En Attente' | 'En Stock' | 'Sur Vinted' | 'Vendu' | 'Partiellement vendu'
export type FundedBy = 'CASH' | 'CELIAN_PERSO' | 'ROMAIN_PERSO'
export type ConsumableCategory = 'PACKAGING' | 'SHIPPING' | 'OTHER'

export interface Consumable {
  id: string
  created_at: string
  name: string
  price: number
  quantity: number
  date: string
  category: ConsumableCategory
}

export const POKEMON_RARITIES: { label: string; symbol: string }[] = [
  { label: 'Commune',                     symbol: '●'   },
  { label: 'Peu commune',                 symbol: '◆'   },
  { label: 'Rare',                        symbol: '★'   },
  { label: 'Rare Holo',                   symbol: '★H'  },
  { label: 'Reverse Holo',               symbol: '★R'  },
  { label: 'Holo',                        symbol: '◈'   },
  { label: 'Cosmos Holo',                symbol: '✦'   },
  { label: 'Holo Parallèle',             symbol: '⬡'   },
  { label: 'EX / GX / V',               symbol: 'UR'  },
  { label: 'VMAX / VSTAR',              symbol: 'VM'  },
  { label: 'Full Art',                   symbol: 'FA'  },
  { label: 'Rainbow Rare',               symbol: '🌈'  },
  { label: 'Gold / Secret Rare',         symbol: 'GS'  },
  { label: 'AR (Art Rare)',              symbol: 'AR'  },
  { label: 'SAR (Special Art Rare)',     symbol: 'SAR' },
  { label: 'Illustration Rare',          symbol: 'IR'  },
  { label: 'Special Illustration Rare', symbol: 'SIR' },
  { label: 'Promo',                      symbol: 'P'   },
  { label: 'Trainer Gallery',            symbol: 'TG'  },
  { label: 'Shiny',                      symbol: '✨'  },
  { label: 'Amazing Rare',               symbol: 'AR+' },
  { label: 'Secret Rare (>set)',         symbol: 'SR'  },
]

export const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'PCA', 'ACE'] as const

export interface InventoryItem {
  id: string
  created_at: string
  item_name: string
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
  // Pokémon-specific
  pokemon_name: string | null
  card_number: string | null
  extension: string | null
  rarity: string | null
  pokemon_category: 'SINGLE' | 'SEALED' | null
  poke_location: 'CELIAN' | 'ROMAIN' | null
  is_graded: boolean
  grading_company: string | null
  grading_note: number | null
  // Lots
  lot_id: string | null
  is_lot: boolean
  lot_total_cost: number | null
  item_count: number | null
  items_sold: number | null
  revenue_generated: number | null
  // Financement perso
  funded_by: FundedBy | null
  // Hits dans un lot
  is_hit: boolean
  parent_lot_id: string | null
  // Réception & vente hit
  received: boolean
  is_sold: boolean
  sold_price: number | null
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
  avgSellDelay: number | null
  stockValueCelian: number
  stockValueRomain: number
  // Financement perso
  romainContribution: number
  celianContribution: number
  // Consommables
  consumablesTotal: number
  avgMonthlyConsumables: number
}

export interface AppSettings {
  initial_capital: number
  roi_target: number
  obj1_label: string
  obj1_target: number
  obj2_label: string
  obj2_target: number
  obj3_label: string
  obj3_target: number
  default_vinted_fees: number
  romain_owed_pokemon: number
  celian_owed_pokemon: number
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
  romain_owed_pokemon: 0,
  celian_owed_pokemon: 0,
}

export interface ItemFormData {
  item_name: string
  purchase_price: string
  vinted_fees: string
  expected_sale_price: string
  location: Location
  notes: string
  // Pokémon
  pokemon_name: string
  card_number: string
  extension: string
  rarity: string
  pokemon_category: 'SINGLE' | 'SEALED'
  poke_location: 'CELIAN' | 'ROMAIN'
  is_graded: boolean
  grading_company: string
  grading_note: string
  // Lots
  is_lot: boolean
  lot_total_cost: string
  nb_articles: string
  // Financement
  funded_by: FundedBy | null
  // Hits
  hits: Array<{ id?: string; pokemon_name: string; card_number: string; estimated_value: string }>
  deletedHitIds?: string[]
  lot_id?: string
}
