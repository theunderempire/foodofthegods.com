import type { Ingredient } from './recipe';

export interface IngredientListItem {
  ingredient: Ingredient;
  completed: boolean;
}

export interface IngredientListGroup {
  name: string;
  items: IngredientListItem[];
}

export interface IngredientList {
  groups: IngredientListGroup[];
  lastModified: string;
}

export interface IngredientListContainer {
  _id?: string;
  userId?: string;
  ingredientList: IngredientList;
}
