export interface Ingredient {
  id: number | string;
  name: string;
  // Numeric for anything scalable; legacy/free-form values like "a pinch" are
  // strings. Recipes imported before null-handling was added may have null.
  amount: number | string | null;
  unit?: string;
  // Shopping-list items only: the "recipeId:ingredientId" keys this line was added
  // from, so a recipe knows what it already contributed even after lines are merged.
  sources?: string[];
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
