import type { Recipe, RecipeListItem } from "../types/recipe";
import { client, unwrap } from "./client";

export async function getRecipes(userId: string): Promise<RecipeListItem[]> {
  return unwrap(client.get(`/recipes/${userId}`));
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const recipes = await unwrap<Recipe[]>(client.get(`/recipe/${id}`));
  return recipes[0] ?? null;
}

export async function addRecipe(recipe: Recipe): Promise<{ msg: string; id: string }> {
  return unwrap(client.post("/recipes", recipe));
}

export async function updateRecipe(recipe: Recipe): Promise<{ msg: string }> {
  return unwrap(client.put(`/recipes/${recipe._id}`, recipe));
}

export async function importRecipeFromUrl(url: string): Promise<Recipe> {
  return unwrap(client.post("/recipes/import-url", { url }));
}

export async function importRecipeFromText(text: string): Promise<Recipe> {
  return unwrap(client.post("/recipes/import-text", { text }));
}

export async function uploadRecipeImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const { imageUrl } = await unwrap<{ imageUrl: string }>(
    client.post("/recipes/upload-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  );
  return imageUrl;
}

export async function deleteRecipe(id: string): Promise<{ msg: string }> {
  return unwrap(client.delete(`/recipes/${id}`));
}
