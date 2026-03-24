export interface Ingredient {
  id: number | string;
  name: string;
  amount: number;
  unit?: string;
}

export interface Direction {
  id: number | string;
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
