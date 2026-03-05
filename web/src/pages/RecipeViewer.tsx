import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addIngredient,
  addIngredients,
  getIngredientList,
} from "../api/ingredientList";
import { getRecipe } from "../api/recipes";
import { useAuth } from "../contexts/AuthContext";
import type { IngredientList } from "../types/ingredientList";
import type { Ingredient, Recipe } from "../types/recipe";

export function RecipeViewer() {
  const { id, shareId } = useParams<{ id?: string; shareId?: string }>();
  const recipeId = id ?? shareId ?? "";
  const { username, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingToList, setAddingToList] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [addingIngredientId, setAddingIngredientId] = useState<number | null>(
    null,
  );
  const [shoppingList, setShoppingList] = useState<IngredientList | null>(null);

  useEffect(() => {
    if (!recipeId) return;
    getRecipe(recipeId)
      .then(setRecipe)
      .catch(() => setError("Recipe not found."))
      .finally(() => setLoading(false));
  }, [recipeId]);

  useEffect(() => {
    if (!username || !isAuthenticated) return;
    getIngredientList(username).then((l) => setShoppingList(l));
  }, [username, isAuthenticated]);

  const listIngredientNames = useMemo(() => {
    const names = new Set<string>();
    shoppingList?.groups.forEach((g) =>
      g.items.forEach((i) => names.add(i.ingredient.name.toLowerCase())),
    );
    return names;
  }, [shoppingList]);

  function isInList(name: string) {
    return listIngredientNames.has(name.toLowerCase());
  }

  async function handleAddToShoppingList() {
    if (!recipe || !username) return;
    const toAdd = recipe.ingredients.filter((ing) => !isInList(ing.name));
    if (toAdd.length === 0) return;
    setAddingToList(true);
    try {
      const updated = await addIngredients(username, toAdd);
      setShoppingList(updated);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 3000);
    } catch {
      setError("Failed to add ingredients to shopping list.");
    } finally {
      setAddingToList(false);
    }
  }

  async function handleAddIngredient(ingredient: Ingredient) {
    if (!username || isInList(ingredient.name)) return;
    setAddingIngredientId(ingredient.id);
    try {
      const updated = await addIngredient(username, ingredient);
      setShoppingList(updated);
    } catch {
      setError("Failed to add ingredient to shopping list.");
    } finally {
      setAddingIngredientId(null);
    }
  }

  function handleCopyShareLink() {
    const link = `${window.location.origin}/recipes/share/${recipeId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  }

  if (loading) return <div className="page-loading">Loading recipe...</div>;
  if (error)
    return (
      <div className="page">
        <div className="alert alert-error">{error}</div>
      </div>
    );
  if (!recipe) return null;

  const newIngredientCount = recipe.ingredients.filter(
    (ing) => !isInList(ing.name),
  ).length;
  const allAdded = newIngredientCount === 0;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          &#8592; Back
        </button>
        {isAuthenticated && id && (
          <div className="viewer-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleCopyShareLink}
            >
              {copySuccess ? "Link copied!" : "Share"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/recipes/edit/${recipeId}`)}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      <article className="recipe-article">
        <h1 className="recipe-title">{recipe.name}</h1>

        {recipe.imageUrl && (
          <div className="recipe-hero-image">
            <img src={recipe.imageUrl} alt={recipe.name} />
          </div>
        )}

        <div className="recipe-meta-bar">
          {recipe.prepDuration && (
            <div className="recipe-meta-chip">
              <span className="chip-label">Prep</span>
              <span className="chip-value">{recipe.prepDuration}</span>
            </div>
          )}
          {recipe.cookDuration && (
            <div className="recipe-meta-chip">
              <span className="chip-label">Cook</span>
              <span className="chip-value">{recipe.cookDuration}</span>
            </div>
          )}
          {recipe.servings && (
            <div className="recipe-meta-chip">
              <span className="chip-label">Servings</span>
              <span className="chip-value">{recipe.servings}</span>
            </div>
          )}
        </div>

        {recipe.ingredients.length > 0 && (
          <section className="recipe-section">
            <div className="section-header">
              <h2>Ingredients</h2>
              {isAuthenticated && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleAddToShoppingList}
                  disabled={addingToList || allAdded}
                >
                  {addSuccess ? (
                    <>&#x2713; Added!</>
                  ) : addingToList ? (
                    "Adding..."
                  ) : allAdded ? (
                    <>&#x2713; All added</>
                  ) : newIngredientCount < recipe.ingredients.length ? (
                    `+ ${newIngredientCount} remaining`
                  ) : (
                    "+ Shopping List"
                  )}
                </button>
              )}
            </div>
            <ul className="ingredient-list">
              {recipe.ingredients.map((ing) => {
                const alreadyAdded = isInList(ing.name);
                return (
                  <li
                    key={ing.id}
                    className={`ingredient-item ${alreadyAdded ? "ingredient-in-list" : ""}`}
                  >
                    <span className="ingredient-amount">
                      {ing.amount}
                      {ing.unit ? ` ${ing.unit}` : ""}
                    </span>
                    <span className="ingredient-name">{ing.name}</span>
                    {isAuthenticated && (
                      <button
                        className="add-ingredient-btn"
                        onClick={() => handleAddIngredient(ing)}
                        disabled={alreadyAdded || addingIngredientId === ing.id}
                        aria-label={
                          alreadyAdded
                            ? `${ing.name} already in shopping list`
                            : `Add ${ing.name} to shopping list`
                        }
                        title={
                          alreadyAdded
                            ? "Already in shopping list"
                            : "Add to shopping list"
                        }
                      >
                        {addingIngredientId === ing.id ? (
                          "..."
                        ) : alreadyAdded ? (
                          <>&#x2713;</>
                        ) : (
                          "+"
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {recipe.directions.length > 0 && (
          <section className="recipe-section">
            <h2>Directions</h2>
            <ol className="direction-list">
              {recipe.directions.map((dir, i) => (
                <li key={dir.id} className="direction-item">
                  <div className="direction-step">{i + 1}</div>
                  <div className="direction-content">
                    <p>{dir.text}</p>
                    {dir.duration && (
                      <span className="direction-duration">{dir.duration}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </div>
  );
}
