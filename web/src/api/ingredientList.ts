import type { Ingredient } from '../types/recipe';
import type { IngredientList, IngredientListContainer, IngredientListItem } from '../types/ingredientList';
import { client } from './client';

function url(userId: string, suffix = '') {
  return `/ingredientList/${userId}${suffix}`;
}

export async function getIngredientList(userId: string): Promise<IngredientList | null> {
  const res = await client.get<IngredientListContainer[]>(url(userId));
  return res.data[0]?.ingredientList ?? null;
}

export async function addIngredient(userId: string, ingredient: Ingredient): Promise<IngredientList> {
  const res = await client.post<IngredientListContainer>(url(userId), { ingredient });
  return res.data.ingredientList;
}

export async function addIngredients(userId: string, ingredients: Ingredient[]): Promise<IngredientList> {
  const res = await client.post<IngredientListContainer>(url(userId, '/many'), { ingredients });
  return res.data.ingredientList;
}

export async function updateIngredient(
  userId: string,
  payload: { groupName: string; ingredientListItem: IngredientListItem }
): Promise<IngredientList> {
  const res = await client.patch<IngredientListContainer>(url(userId), { payload });
  return res.data.ingredientList;
}

export async function removeIngredient(userId: string, groupName: string, itemId: number): Promise<IngredientList> {
  const res = await client.delete<IngredientListContainer>(url(userId, `/${groupName}/${itemId}`));
  return res.data.ingredientList;
}

export async function clearAllIngredients(userId: string): Promise<IngredientList> {
  const res = await client.delete<IngredientListContainer>(url(userId, '/all'));
  return res.data.ingredientList;
}

export async function clearMarkedIngredients(userId: string): Promise<IngredientList> {
  const res = await client.delete<IngredientListContainer>(url(userId, '/marked'));
  return res.data.ingredientList;
}

export async function groupIngredients(userId: string): Promise<IngredientList> {
  const res = await client.get<IngredientListContainer>(url(userId, '/group'));
  return res.data.ingredientList;
}
