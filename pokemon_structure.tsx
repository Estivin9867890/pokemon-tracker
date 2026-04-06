export interface PokemonCard {
  pokemon_name: string;
  card_number: string;
  extension: string;
  rarity: string;
  category: 'SINGLE' | 'SEALED';
  location: 'CELIAN' | 'LOUIS';
  grading?: {
    is_graded: boolean;
    company: string;
    note: number;
  };
}

export const POKEMON_RARITIES = [
  "Commune", "Rare Holo", "EX/GX/V", "VMAX/VSTAR", "SAR", "Secret Gold"
];