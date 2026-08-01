import type { AxiosResponse } from "axios";
import type { Ingredient } from "../types/recipe";
import type {
  IngredientList,
  IngredientListContainer,
  IngredientListItem,
} from "../types/ingredientList";
import { client, unwrap, BASE_URL } from "./client";
import type { ApiResponse } from "./client";

function url(userId: string, suffix = "") {
  return `/ingredientList/${userId}${suffix}`;
}

// Every mutation responds with the whole container, so they all unwrap the same
// way. `null` is preserved for a user who has no list document yet.
async function unwrapList(
  request: Promise<AxiosResponse<ApiResponse<IngredientListContainer>>>,
): Promise<IngredientList | null> {
  return (await unwrap(request)).ingredientList ?? null;
}

export async function getIngredientList(userId: string): Promise<IngredientList | null> {
  const containers = await unwrap<IngredientListContainer[]>(client.get(url(userId)));
  return containers[0]?.ingredientList ?? null;
}

export async function addIngredient(
  userId: string,
  ingredient: Ingredient,
): Promise<IngredientList | null> {
  return unwrapList(client.post(url(userId), { ingredient }));
}

export async function addIngredients(
  userId: string,
  ingredients: Ingredient[],
): Promise<IngredientList | null> {
  return unwrapList(client.post(url(userId, "/many"), { ingredients }));
}

export async function updateIngredient(
  userId: string,
  payload: { groupName: string; ingredientListItem: IngredientListItem },
): Promise<IngredientList | null> {
  return unwrapList(client.patch(url(userId), { payload }));
}

export async function removeIngredient(
  userId: string,
  groupName: string,
  itemId: number | string,
): Promise<IngredientList | null> {
  return unwrapList(client.delete(url(userId, `/${groupName}/${itemId}`)));
}

export async function clearAllIngredients(userId: string): Promise<IngredientList | null> {
  return unwrapList(client.delete(url(userId, "/all")));
}

export async function clearMarkedIngredients(userId: string): Promise<IngredientList | null> {
  return unwrapList(client.delete(url(userId, "/marked")));
}

export async function groupIngredients(userId: string): Promise<IngredientList | null> {
  return unwrapList(client.get(url(userId, "/group")));
}

export function subscribeToList(
  userId: string,
  token: string,
  onUpdate: (list: IngredientList) => void,
): () => void {
  const es = new EventSource(
    `${BASE_URL}/ingredientList/${userId}/stream?token=${encodeURIComponent(token)}`,
  );
  es.onmessage = (e) => {
    try {
      const container: IngredientListContainer = JSON.parse(e.data);
      onUpdate(container.ingredientList);
    } catch {
      console.error("[sse] failed to parse message", e.data);
    }
  };
  es.onerror = () => console.warn("[sse] connection error, will retry");
  return () => es.close();
}
