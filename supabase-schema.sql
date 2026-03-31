-- ================================================
-- MONACO — Gestionnaire de Flipping Vinted
-- Schéma Supabase / PostgreSQL
-- ================================================

-- Table principale
CREATE TABLE IF NOT EXISTS inventory (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  item_name          TEXT NOT NULL,
  purchase_price     NUMERIC(10, 2) NOT NULL,
  vinted_fees        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  expected_sale_price NUMERIC(10, 2),
  actual_sale_price  NUMERIC(10, 2),             -- NULL = en stock, rempli = vendu
  sale_fees          NUMERIC(10, 2) DEFAULT 0,   -- Frais Vinted côté vente
  location           TEXT CHECK (location IN ('Chez Louis', 'Chez Célian')) NOT NULL,
  status             TEXT CHECK (status IN ('En Stock', 'Vendu')) NOT NULL DEFAULT 'En Stock',
  sold_at            TIMESTAMPTZ,
  notes              TEXT
);

-- Index performance
CREATE INDEX IF NOT EXISTS idx_inventory_status     ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_location   ON inventory(location);
CREATE INDEX IF NOT EXISTS idx_inventory_created_at ON inventory(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_sold_at    ON inventory(sold_at DESC);

-- RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Politique permissive (pas d'auth complexe — accès direct associés)
-- Pour un usage partagé sans auth, désactiver RLS ou utiliser une politique ouverte :
CREATE POLICY "Open access" ON inventory
  FOR ALL USING (true) WITH CHECK (true);

-- Vue calculée avec marges
CREATE OR REPLACE VIEW inventory_analytics AS
SELECT
  *,
  (purchase_price + vinted_fees)                            AS cost_basis,
  CASE
    WHEN actual_sale_price IS NOT NULL
      THEN actual_sale_price - COALESCE(sale_fees, 0) - purchase_price - vinted_fees
    WHEN expected_sale_price IS NOT NULL
      THEN expected_sale_price - purchase_price - vinted_fees
    ELSE NULL
  END                                                       AS margin_net,
  CASE
    WHEN (purchase_price + vinted_fees) > 0 AND actual_sale_price IS NOT NULL
      THEN ROUND(
        (actual_sale_price - COALESCE(sale_fees, 0) - purchase_price - vinted_fees)
        / (purchase_price + vinted_fees) * 100, 1
      )
    WHEN (purchase_price + vinted_fees) > 0 AND expected_sale_price IS NOT NULL
      THEN ROUND(
        (expected_sale_price - purchase_price - vinted_fees)
        / (purchase_price + vinted_fees) * 100, 1
      )
    ELSE NULL
  END                                                       AS roi_percent
FROM inventory;
