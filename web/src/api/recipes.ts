import type { Recipe, RecipeListItem } from "../types/recipe";
import { client } from "./client";

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export async function getRecipes(userId: string): Promise<RecipeListItem[]> {
  const res = await client.get<ApiResponse<RecipeListItem[]>>(
    `/recipes/${userId}`,
  );

  if (res.data.success) {
    return res.data.data;
  } else {
    console.error(res.status, res.statusText);
    return [];
  }
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const res = await client.get<ApiResponse<Recipe[]>>(`/recipe/${id}`);

  if (res.data.success) {
    return res.data.data[0];
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function addRecipe(
  recipe: Recipe,
): Promise<ApiResponse<{ msg: string }> | null> {
  const res = await client.post<ApiResponse<{ msg: string }>>(
    "/recipes",
    recipe,
  );

  if (res.data.success) {
    return res.data;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function updateRecipe(
  recipe: Recipe,
): Promise<ApiResponse<{ msg: string }> | null> {
  const res = await client.put<ApiResponse<{ msg: string }>>(
    `/recipes/${recipe._id}`,
    recipe,
  );

  if (res.data.success) {
    return res.data;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function deleteRecipe(
  id: string,
): Promise<ApiResponse<{ msg: string }> | null> {
  const res = await client.delete<ApiResponse<{ msg: string }>>(
    `/recipes/${id}`,
  );

  if (res.data.success) {
    return res.data;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}
