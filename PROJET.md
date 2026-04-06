# PROJET — Pokémon Card Flipping Tracker

Dashboard de gestion d'inventaire et de suivi financier pour le business de flipping de cartes Pokémon (Célian & Romain).

---

## Stack technique

| Outil | Version |
|---|---|
| Next.js (App Router) | 16.2.1 |
| React | 19.2.4 |
| TypeScript | 5 |
| Tailwind CSS | v4 (PostCSS) |
| Recharts | 3.8.1 |
| Lucide React | icônes |
| Appwrite | backend DB (actif) |
| Supabase | client configuré, non utilisé |

**Chemin local :** `/Users/louisestivin/Desktop/Claude/Pokemon`

---

## Architecture des fichiers

```
/Pokemon/
├── app/
│   ├── page.tsx              → Redirect vers /dashboard
│   ├── layout.tsx            → Root layout + metadata + font Geist
│   ├── globals.css           → Styles globaux
│   └── dashboard/
│       └── page.tsx          → App entière (state, logique, tabs, modals)
├── components/
│   ├── StatsBar.tsx          → 4 KPI tiles en haut (Capital, Profit, ROI, Stock)
│   ├── StockTab.tsx          → Onglet stock en cours
│   ├── ArchivesTab.tsx       → Onglet historique des ventes
│   ├── StatsTab.tsx          → Onglet statistiques avancées + graphiques
│   ├── ObjectifsTab.tsx      → Onglet suivi des objectifs de bénéfice
│   ├── TresorerieTab.tsx     → Onglet répartition du capital (donut chart)
│   ├── AddEditModal.tsx      → Modal ajout / modification d'un item
│   ├── SellModal.tsx         → Modal pour marquer un item vendu
│   ├── DeleteModal.tsx       → Modal confirmation suppression
│   ├── SettingsModal.tsx     → Modal paramètres (capital, ROI cible, objectifs)
│   ├── ItemDetailModal.tsx   → Modal détail complet d'un item
│   └── ui/
│       ├── Modal.tsx         → Base modale (Escape + backdrop click)
│       ├── Input.tsx         → Input avec label, suffix (€/%), hint, error
│       ├── Select.tsx        → Dropdown component
│       └── Badge.tsx         → Badge de statut (violet/blue variants)
├── lib/
│   ├── calculations.ts       → Moteur de calcul (calcItem, calcStats, formatters)
│   ├── db.ts                 → Fonctions Appwrite CRUD
│   ├── appwrite.ts           → Init client Appwrite
│   ├── supabase.ts           → Init client Supabase (non utilisé)
│   ├── mock-data.ts          → 8 items de test (4 vendus, 4 en stock)
│   ├── settings.ts           → Utilitaires settings
│   └── utils.ts              → Helper cn() pour Tailwind
└── types/
    └── index.ts              → Tous les types TypeScript
```

---

## Types TypeScript (`/types/index.ts`)

### `InventoryItem`
Objet central de l'app.
```ts
{
  id, created_at
  product_name, extension
  product_type: "Carte à l'unité" | "Produit Scellé" | null
  is_graded: boolean
  grading_company: "PSA" | "PCA" | "BGS" | "CGC" | "Autre" | null
  grade: number | null       // 1–10
  purchase_price, vinted_fees
  expected_sale_price, actual_sale_price
  sale_fees, boost_cost
  location: "Chez Célian" | "Chez Romain"
  status: "En Attente" | "En Stock" | "Sur Vinted" | "Vendu"
  posted_at, sold_at, notes
}
```

### `ItemWithCalc`
`InventoryItem` + champs calculés :
- `cost_basis` = purchase_price + vinted_fees + boost_cost
- `margin_net` = actual_sale_price - sale_fees - cost_basis
- `roi_percent` = (margin_net / cost_basis) × 100

### `DashboardStats`
Métriques agrégées :
- `currentCapital, cashInHand, stockValue`
- `netProfit, avgROI`
- `stockCount, soldCount, pendingValue, avgSellDelay`
- `stockValueCelian, stockValueRomain` (split par localisation)

### `AppSettings`
```ts
{
  initial_capital: number    // capital de départ (défaut 200€)
  roi_target: number         // ROI minimum cible en % (défaut 30%)
  default_vinted_fees: number
  obj1_label, obj1_target
  obj2_label, obj2_target
  obj3_label, obj3_target
}
```

---

## Moteur de calcul (`/lib/calculations.ts`)

### `calcItem(item)`
Calcule les métriques d'un item (pour items vendus).

### `calcStats(items, initialCapital)`
Agrège toutes les stats du dashboard :
- **Stock value** = somme des `purchase_price + vinted_fees` des items non vendus
- **Cash in hand** = capital initial - total dépensé (achats) + total encaissé (ventes nettes)
- **Current capital** = cash + stock value
- **Net profit** = somme des `margin_net` sur items vendus uniquement
- **Avg ROI** = moyenne des ROI% sur items vendus
- **Avg sell delay** = moyenne de (sold_at - posted_at) en jours
- **Stock split** = valeur stock par localisation

### Formatters
- `formatCurrency(v, showSign?)` → locale française (EUR)
- `formatROI(v)` → `"+X.X%"` ou `"—"`
- `roiColor(v, target)` → classe CSS couleur selon performance

---

## Fonctionnalités par onglet

### Stock (`StockTab`)
- Tableau par localisation (Chez Célian / Chez Romain)
- Colonnes : Produit, Extension, Coût, Prix visé, Marge est., ROI
- Badges statut : En Attente, Sur Vinted, infos grading
- Actions par ligne : Marquer reçu, Toggle Vinted, Vendre, Modifier, Supprimer
- État vide avec call-to-action

### Archives (`ArchivesTab`)
- Stats en en-tête : Bénéfice net, ROI global, CA, Délai moyen de vente
- Tableau détaillé avec dates de vente
- Icônes tendance profit/perte
- Indicateurs de performance (objectif atteint, profit, perte)

### Statistiques (`StatsTab`)
- Sélecteur de période : 7j / 1m / 3m / 6m / 1an / All Time
- Cards KPI : CA, Bénéf moyen, Nb ventes, Délai vente, Stock, Budget boost
- Métriques évolution vs période précédente
- **Area chart** : tendances CA & Bénéfice
- **Donut chart** : répartition Carte vs Scellé
- **Bar chart** : volume de ventes par type
- **Tableau Top 5** extensions

### Objectifs (`ObjectifsTab`)
- Cards résumé : Bénéfice net, Capital total, Prochain objectif
- 3 barres de progression personnalisables avec code couleur
- Statut de complétion + montant restant

### Trésorerie (`TresorerieTab`)
- Tiles résumé : Stock Célian, Stock Romain, Cash disponible
- **Donut pie chart** : répartition du capital
- Légende détaillée

---

## Modals

### `AddEditModal`
- Champs : Nom, Extension, Type (Carte/Scellé toggle), Gradée (toggle → company + note)
- Prix achat, Frais Vinted (pré-rempli via settings), Prix de revente visé
- **Preview marge + ROI en temps réel** (vert/amber/rouge selon objectif)
- Localisation dropdown
- Notes textarea
- Validation : nom et prix requis

### `SellModal`
- Info item + Prix de vente réel
- Frais Vinted côté vente
- Toggle boost + coût
- Preview marge/ROI final (couleurs selon target)

### `SettingsModal`
- Capital initial, ROI cible %, Frais Vinted par défaut
- 3 objectifs personnalisables (label + montant cible)

### `ItemDetailModal`
- Vue détail complet d'un item

### `DeleteModal`
- Confirmation suppression

---

## Backend Appwrite (`/lib/db.ts`)

Collection Appwrite avec mapping vers `InventoryItem` (gère le champ legacy `item_name` → `product_name`).

| Fonction | Description |
|---|---|
| `listItems()` | Fetch 200 items, triés par date desc |
| `addItem(data)` | Crée un document |
| `editItem(id, data)` | Met à jour nom/prix/localisation/notes |
| `markSold(id, price, saleFees, boostCost)` | Passe status → "Vendu" |
| `toggleVinted(id, currentStatus)` | Bascule "Sur Vinted" ↔ "En Stock" |
| `markReceived(id)` | Passe status → "En Stock" |
| `removeItem(id)` | Supprime le document |

**Note :** Le dashboard utilise actuellement les mock-data (`MOCK_ITEMS`). Pour brancher Appwrite, remplacer le `useState(MOCK_ITEMS)` par un `useEffect` qui appelle `listItems()`.

---

## Données mock (`/lib/mock-data.ts`)

8 items de démonstration :
- 4 vendus (Dracaufeu Base Set, Mewtwo Neo Genesis, Pikachu VMAX, Booster Box XY)
- 4 en stock (Dracaufeu VSTAR, Lugia Neo Revelation gradé PSA 9, Charizard ex, Coffret Elite)
- Exemples de tous les types : Carte à l'unité, Produit Scellé, Gradé/Non-gradé
- Localisations mixtes Célian/Romain

---

## Design system

| Aspect | Valeur |
|---|---|
| Fond | `bg-[#09090b]` (quasi-noir) |
| Bordures | `border-zinc-800/80` |
| Succès / ROI OK | `emerald` |
| Avertissement | `amber` |
| Danger / perte | `red` |
| Info / gradé | `amber` |
| Carte | `sky` |
| Scellé | `violet` |
| Font | Geist (Vercel) |

---

## État actuel & points d'évolution

### Fait
- [x] Dashboard complet avec 5 onglets
- [x] CRUD complet (ajout, édition, suppression, vente)
- [x] Calculs ROI en temps réel
- [x] Graphiques (area, donut, bar)
- [x] Objectifs personnalisables
- [x] Vue Trésorerie avec répartition capital
- [x] Grading (PSA, PCA, BGS, CGC)
- [x] Frais Vinted configurables
- [x] Split par localisation (Célian / Romain)
- [x] Fonctions Appwrite complètes dans `db.ts`
- [x] Design dark premium

### À faire (si reprise)
- [ ] Brancher Appwrite dans `dashboard/page.tsx` (remplacer mock-data par appels DB)
- [ ] Configurer les variables d'env Appwrite (`.env.local`)
- [ ] Ajouter les settings persistés (localStorage ou Appwrite)
- [ ] Pagination si > 200 items
- [ ] Export CSV des archives

---

## Variables d'environnement nécessaires (`.env.local`)

```
NEXT_PUBLIC_APPWRITE_ENDPOINT=...
NEXT_PUBLIC_APPWRITE_PROJECT_ID=...
NEXT_PUBLIC_DATABASE_ID=...
NEXT_PUBLIC_COLLECTION_ID=...
```

---

*Dernière mise à jour du projet : avril 2026*
