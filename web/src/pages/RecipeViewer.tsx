import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addIngredients } from '../api/ingredientList';
import { getRecipe } from '../api/recipes';
import { useAuth } from '../contexts/AuthContext';
import type { Recipe } from '../types/recipe';

export function RecipeViewer() {
  const { id, shareId } = useParams<{ id?: string; shareId?: string }>();
  const recipeId = id ?? shareId ?? '';
  const { username, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingToList, setAddingToList] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (!recipeId) return;
    getRecipe(recipeId)
      .then(setRecipe)
      .catch(() => setError('Recipe not found.'))
      .finally(() => setLoading(false));
  }, [recipeId]);

  async function handleAddToShoppingList() {
    if (!recipe || !username) return;
    setAddingToList(true);
    try {
      await addIngredients(username, recipe.ingredients);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 3000);
    } catch {
      setError('Failed to add ingredients to shopping list.');
    } finally {
      setAddingToList(false);
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
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!recipe) return null;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          &#8592; Back
        </button>
        {isAuthenticated && id && (
          <div className="viewer-actions">
            <button className="btn btn-ghost btn-sm" onClick={handleCopyShareLink}>
              {copySuccess ? 'Link copied!' : 'Share'}
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
                  disabled={addingToList}
                >
                  {addSuccess ? '&#x2713; Added!' : addingToList ? 'Adding...' : '+ Shopping List'}
                </button>
              )}
            </div>
            <ul className="ingredient-list">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id} className="ingredient-item">
                  <span className="ingredient-amount">
                    {ing.amount}{ing.unit ? ` ${ing.unit}` : ''}
                  </span>
                  <span className="ingredient-name">{ing.name}</span>
                </li>
              ))}
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
