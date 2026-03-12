import { useEffect, useState } from "react";
import { Link, useNavigate, useNavigationType } from "react-router-dom";
import { deleteRecipe, getRecipes } from "../api/recipes";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../contexts/AuthContext";
import type { RecipeListItem } from "../types/recipe";

// Resets on every full page load (including refresh), persists across SPA navigation
const SESSION_ID = Math.random().toString(36).slice(2);

function readSaved(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { sid, value } = JSON.parse(raw);
    return sid === SESSION_ID ? value : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: string) {
  sessionStorage.setItem(key, JSON.stringify({ sid: SESSION_ID, value }));
}

export function RecipeList() {
  const { username } = useAuth();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const isBackNav = navigationType === "POP";
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [filter, setFilter] = useState(() =>
    isBackNav ? (readSaved("recipe-list-filter") ?? "") : "",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RecipeListItem | null>(null);

  useEffect(() => {
    if (!username) return;
    getRecipes(username)
      .then(setRecipes)
      .catch(() => setError("Failed to load recipes."))
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(() => {
    writeSaved("recipe-list-filter", filter);
  }, [filter]);

  useEffect(() => {
    const onScroll = () => writeSaved("recipe-list-scroll", String(window.scrollY));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!loading && isBackNav) {
      const saved = readSaved("recipe-list-scroll");
      if (saved) requestAnimationFrame(() => window.scrollTo(0, parseInt(saved)));
    }
  }, [loading, isBackNav]);

  const filtered = recipes
    .filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRecipe(deleteTarget._id);
      setRecipes((prev) => prev.filter((r) => r._id !== deleteTarget._id));
    } catch {
      setError("Failed to delete recipe.");
    } finally {
      setDeleteTarget(null);
    }
  }

  function formatDuration(d: string) {
    return d || "—";
  }

  if (loading) return <div className="page-loading">Loading recipes...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Recipes</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="search-bar">
        <input
          type="text"
          className="input search-input"
          placeholder="Search recipes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && (
          <button className="search-clear" onClick={() => setFilter("")}>
            &#x2715;
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          {filter ? (
            <p>No recipes match "{filter}"</p>
          ) : (
            <>
              <p>No recipes yet.</p>
              <button className="btn btn-primary" onClick={() => navigate("/recipes/add")}>
                Add your first recipe
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="recipe-grid">
          {filtered.map((recipe) => (
            <div key={recipe._id} className="recipe-card">
              <Link to={`/recipes/recipe/${recipe._id}`} className="recipe-card-link">
                {recipe.imageUrl && (
                  <div className="recipe-card-image">
                    <img src={recipe.imageUrl} alt={recipe.name} />
                  </div>
                )}
                <h2 className="recipe-card-title">{recipe.name}</h2>
                <div className="recipe-card-meta">
                  <span className="meta-item">
                    <span className="meta-label">Prep</span>
                    <span>{formatDuration(recipe.prepDuration)}</span>
                  </span>
                  <span className="meta-divider">·</span>
                  <span className="meta-item">
                    <span className="meta-label">Cook</span>
                    <span>{formatDuration(recipe.cookDuration)}</span>
                  </span>
                </div>
              </Link>
              <div className="recipe-card-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate(`/recipes/edit/${recipe._id}`)}
                >
                  Edit
                </button>
                <button
                  className="btn btn-ghost btn-sm btn-danger-text"
                  onClick={() => setDeleteTarget(recipe)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <button className="fab" onClick={() => navigate("/recipes/add")} aria-label="Add recipe">
        +
      </button>
    </div>
  );
}
