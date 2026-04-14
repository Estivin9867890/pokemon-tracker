export interface Consumable {
  $id: string;
  name: string;
  price: number;    // Prix unitaire
  quantity: number; // Quantité achetée
  category: string;
}

export interface InvestorStats {
  louis_owed_pokemon: number;
  celian_owed_pokemon: number;
  initial_capital: number; // Ton apport de départ (ex: 200€)
}
