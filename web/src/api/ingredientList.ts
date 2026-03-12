import type { Ingredient } from "../types/recipe";
import type {
  IngredientList,
  IngredientListContainer,
  IngredientListItem,
} from "../types/ingredientList";
import { client, BASE_URL } from "./client";
import { ApiResponse } from "./recipes";

function url(userId: string, suffix = "") {
  return `/ingredientList/${userId}${suffix}`;
}

export async function getIngredientList(userId: string): Promise<IngredientList | null> {
  const res = await client.get<ApiResponse<IngredientListContainer[]>>(url(userId));
  if (res.data.success) {
    return res.data.data[0]?.ingredientList ?? null;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function addIngredient(
  userId: string,
  ingredient: Ingredient,
): Promise<IngredientList | null> {
  const res = await client.post<ApiResponse<IngredientListContainer>>(url(userId), { ingredient });
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function addIngredients(
  userId: string,
  ingredients: Ingredient[],
): Promise<IngredientList | null> {
  const res = await client.post<ApiResponse<IngredientListContainer>>(url(userId, "/many"), {
    ingredients,
  });
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function updateIngredient(
  userId: string,
  payload: { groupName: string; ingredientListItem: IngredientListItem },
): Promise<IngredientList | null> {
  const res = await client.patch<ApiResponse<IngredientListContainer>>(url(userId), { payload });
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function removeIngredient(
  userId: string,
  groupName: string,
  itemId: number,
): Promise<IngredientList | null> {
  const res = await client.delete<ApiResponse<IngredientListContainer>>(
    url(userId, `/${groupName}/${itemId}`),
  );
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function clearAllIngredients(userId: string): Promise<IngredientList | null> {
  const res = await client.delete<ApiResponse<IngredientListContainer>>(url(userId, "/all"));
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function clearMarkedIngredients(userId: string): Promise<IngredientList | null> {
  const res = await client.delete<ApiResponse<IngredientListContainer>>(url(userId, "/marked"));
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
}

export async function groupIngredients(userId: string): Promise<IngredientList | null> {
  const res = await client.get<ApiResponse<IngredientListContainer>>(url(userId, "/group"));
  if (res.data.success) {
    return res.data.data.ingredientList;
  } else {
    console.error(res.status, res.statusText);
    return null;
  }
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
