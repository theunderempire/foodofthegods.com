import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addRecipe,
  getRecipe,
  importRecipeFromUrl,
  updateRecipe,
} from "../api/recipes";
import { useAuth } from "../contexts/AuthContext";
import type { Direction, Ingredient, Recipe } from "../types/recipe";

function blankIngredient(id: number): Ingredient {
  return { id, name: "", amount: 0, unit: "" };
}

function blankDirection(id: number): Direction {
  return { id, text: "", duration: "" };
}

function nextId(items: { id: number }[]): number {
  return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1;
}

export function RecipeForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const { username } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [prepDuration, setPrepDuration] = useState("");
  const [cookDuration, setCookDuration] = useState("");
  const [servings, setServings] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    blankIngredient(1),
  ]);
  const [directions, setDirections] = useState<Direction[]>([
    blankDirection(1),
  ]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    getRecipe(id)
      .then((r) => {
        if (!r) return;
        setName(r.name ?? "");
        setPrepDuration(r.prepDuration ?? "");
        setCookDuration(r.cookDuration ?? "");
        setServings(r.servings ?? "");
        setImageUrl(r.imageUrl ?? "");
        setIngredients(r.ingredients.length > 0 ? r.ingredients : [blankIngredient(1)]);
        setDirections(r.directions.length > 0 ? r.directions : [blankDirection(1)]);
      })
      .catch(() => setError("Failed to load recipe."))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // --- Ingredient helpers ---
  function updateIngredient(idx: number, patch: Partial<Ingredient>) {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)),
    );
  }
  function addIngredient() {
    setIngredients((prev) => [...prev, blankIngredient(nextId(prev))]);
  }
  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveIngredient(idx: number, dir: -1 | 1) {
    setIngredients((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // --- Direction helpers ---
  function updateDirection(idx: number, patch: Partial<Direction>) {
    setDirections((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  }
  function addDirection() {
    setDirections((prev) => [...prev, blankDirection(nextId(prev))]);
  }
  function removeDirection(idx: number) {
    setDirections((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveDirection(idx: number, dir: -1 | 1) {
    setDirections((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError("");
    try {
      const recipe = await importRecipeFromUrl(importUrl.trim());
      if (!recipe) {
        setError("Failed to import recipe from URL.");
        return;
      }
      setName(recipe.name ?? "");
      setPrepDuration(recipe.prepDuration ?? "");
      setCookDuration(recipe.cookDuration ?? "");
      setServings(recipe.servings ?? "");
      setImageUrl(recipe.imageUrl ?? "");
      setIngredients(
        recipe.ingredients?.length > 0
          ? recipe.ingredients
          : [blankIngredient(1)],
      );
      setDirections(
        recipe.directions?.length > 0 ? recipe.directions : [blankDirection(1)],
      );
      setImportUrl("");
    } catch {
      setError("Failed to import recipe from URL.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Recipe name is required.");
      return;
    }
    setSaving(true);
    setError("");

    const recipe: Recipe = {
      ...(id ? { _id: id } : {}),
      name: name.trim(),
      prepDuration,
      cookDuration,
      servings,
      ingredients,
      directions,
      userId: username ?? "",
      imageUrl: imageUrl.trim() || undefined,
    };

    try {
      if (isEdit) {
        await updateRecipe(recipe);
      } else {
        await addRecipe(recipe);
      }
      navigate("/recipes");
    } catch {
      setError("Failed to save recipe.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-loading">Loading recipe...</div>;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          &#8592; Back
        </button>
        <h1 className="page-title">{isEdit ? "Edit Recipe" : "New Recipe"}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!isEdit && (
        <div className="import-url-section">
          <label htmlFor="importUrl">Import from URL</label>
          <div className="import-url-row">
            <input
              id="importUrl"
              type="url"
              className="input"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste a recipe URL to auto-fill the form"
              disabled={importing}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleImport}
              disabled={importing || !importUrl.trim()}
            >
              Import
            </button>
          </div>
        </div>
      )}

      {importing && <div className="page-loading">Importing recipe...</div>}

      <form
        onSubmit={handleSubmit}
        className="recipe-form"
        style={importing ? { display: "none" } : undefined}
      >
        <section className="form-section">
          <h2 className="form-section-title">Details</h2>
          <div className="form-group">
            <label htmlFor="name">Recipe Name *</label>
            <input
              id="name"
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Grandma's Lasagna"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="prepDuration">Prep Time</label>
              <input
                id="prepDuration"
                type="text"
                className="input"
                value={prepDuration}
                onChange={(e) => setPrepDuration(e.target.value)}
                placeholder="e.g. 15 min"
              />
            </div>
            <div className="form-group">
              <label htmlFor="cookDuration">Cook Time</label>
              <input
                id="cookDuration"
                type="text"
                className="input"
                value={cookDuration}
                onChange={(e) => setCookDuration(e.target.value)}
                placeholder="e.g. 45 min"
              />
            </div>
            <div className="form-group">
              <label htmlFor="servings">Servings</label>
              <input
                id="servings"
                type="text"
                className="input"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="e.g. 4"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="imageUrl">Image URL</label>
            <input
              id="imageUrl"
              type="url"
              className="input"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Ingredients</h2>
          <div className="items-list">
            {ingredients.map((ing, idx) => (
              <div key={ing.id} className="list-item-row">
                <div className="item-reorder">
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => moveIngredient(idx, -1)}
                    disabled={idx === 0}
                  >
                    &#x25B2;
                  </button>
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => moveIngredient(idx, 1)}
                    disabled={idx === ingredients.length - 1}
                  >
                    &#x25BC;
                  </button>
                </div>
                <input
                  type="number"
                  className="input input-sm input-amount"
                  value={ing.amount || ""}
                  onChange={(e) =>
                    updateIngredient(idx, {
                      amount: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="Amt"
                  min="0"
                  step="any"
                />
                <input
                  type="text"
                  className="input input-sm input-unit"
                  value={ing.unit ?? ""}
                  onChange={(e) =>
                    updateIngredient(idx, { unit: e.target.value })
                  }
                  placeholder="Unit"
                />
                <input
                  type="text"
                  className="input input-sm input-name"
                  value={ing.name}
                  onChange={(e) =>
                    updateIngredient(idx, { name: e.target.value })
                  }
                  placeholder="Ingredient name"
                />
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeIngredient(idx)}
                  disabled={ingredients.length === 1}
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={addIngredient}
          >
            + Add Ingredient
          </button>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Directions</h2>
          <div className="items-list">
            {directions.map((dir, idx) => (
              <div key={dir.id} className="list-item-row list-item-direction">
                <div className="item-reorder">
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => moveDirection(idx, -1)}
                    disabled={idx === 0}
                  >
                    &#x25B2;
                  </button>
                  <span className="step-number">{idx + 1}</span>
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => moveDirection(idx, 1)}
                    disabled={idx === directions.length - 1}
                  >
                    &#x25BC;
                  </button>
                </div>
                <div className="direction-inputs">
                  <textarea
                    className="input input-sm"
                    value={dir.text}
                    onChange={(e) =>
                      updateDirection(idx, { text: e.target.value })
                    }
                    placeholder="Describe this step..."
                    rows={2}
                  />
                  <input
                    type="text"
                    className="input input-sm input-duration"
                    value={dir.duration}
                    onChange={(e) =>
                      updateDirection(idx, { duration: e.target.value })
                    }
                    placeholder="Duration (optional)"
                  />
                </div>
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeDirection(idx)}
                  disabled={directions.length === 1}
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={addDirection}
          >
            + Add Step
          </button>
        </section>

        <div className="form-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Recipe"}
          </button>
        </div>
      </form>
    </div>
  );
}
