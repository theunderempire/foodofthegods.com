export interface Ingredient {
  id: number;
  name: string;
  amount: number;
  unit?: string;
}

export interface Direction {
  id: number;
  text: string;
  duration: string;
}

export interface Recipe {
  _id?: string;
  name: string;
  prepDuration: string;
  cookDuration: string;
  servings: string;
  ingredients: Ingredient[];
  directions: Direction[];
  userId?: string;
  imageUrl?: string;
}

export interface RecipeListItem {
  _id: string;
  name: string;
  prepDuration: string;
  cookDuration: string;
  imageUrl?: string;
}
