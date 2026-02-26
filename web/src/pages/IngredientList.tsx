import { useEffect, useState } from 'react';
import {
  clearAllIngredients,
  clearMarkedIngredients,
  getIngredientList,
  groupIngredients,
  removeIngredient,
  updateIngredient,
} from '../api/ingredientList';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import type { IngredientList as IngredientListType, IngredientListGroup, IngredientListItem } from '../types/ingredientList';

export function IngredientList() {
  const { username } = useAuth();
  const [list, setList] = useState<IngredientListType | null>(null);
  const [loading, setLoading] = useState(true);
  const [grouping, setGrouping] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState<'all' | 'marked' | null>(null);

  useEffect(() => {
    if (!username) return;
    getIngredientList(username)
      .then((l) => setList(l ?? { groups: [], lastModified: '' }))
      .catch(() => setError('Failed to load shopping list.'))
      .finally(() => setLoading(false));
  }, [username]);

  async function handleToggle(group: IngredientListGroup, item: IngredientListItem) {
    if (!username) return;
    const updated = await updateIngredient(username, {
      groupName: group.name,
      ingredientListItem: { ...item, completed: !item.completed },
    });
    setList(updated);
  }

  async function handleRemove(groupName: string, itemId: number) {
    if (!username) return;
    const updated = await removeIngredient(username, groupName, itemId);
    setList(updated);
  }

  async function handleClearAll() {
    if (!username) return;
    setClearing(true);
    try {
      const updated = await clearAllIngredients(username);
      setList(updated);
    } catch {
      setError('Failed to clear list.');
    } finally {
      setClearing(false);
      setConfirmClear(null);
    }
  }

  async function handleClearMarked() {
    if (!username) return;
    setClearing(true);
    try {
      const updated = await clearMarkedIngredients(username);
      setList(updated);
    } catch {
      setError('Failed to clear marked items.');
    } finally {
      setClearing(false);
      setConfirmClear(null);
    }
  }

  async function handleGroup() {
    if (!username) return;
    setGrouping(true);
    try {
      const updated = await groupIngredients(username);
      setList(updated);
    } catch {
      setError('Failed to auto-group ingredients.');
    } finally {
      setGrouping(false);
    }
  }

  const totalItems = list?.groups.reduce((sum, g) => sum + g.items.length, 0) ?? 0;
  const markedItems = list?.groups.reduce(
    (sum, g) => sum + g.items.filter((i) => i.completed).length,
    0
  ) ?? 0;

  if (loading) return <div className="page-loading">Loading shopping list...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Shopping List</h1>
        <div className="list-toolbar">
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleGroup}
            disabled={grouping || totalItems === 0}
            title="Auto-group by store section using AI"
          >
            {grouping ? 'Grouping...' : '&#x2728; Auto-group'}
          </button>
          {markedItems > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmClear('marked')}
              disabled={clearing}
            >
              Remove checked ({markedItems})
            </button>
          )}
          {totalItems > 0 && (
            <button
              className="btn btn-ghost btn-sm btn-danger-text"
              onClick={() => setConfirmClear('all')}
              disabled={clearing}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {totalItems === 0 ? (
        <div className="empty-state">
          <p>Your shopping list is empty.</p>
          <p className="empty-hint">Add ingredients from a recipe to get started.</p>
        </div>
      ) : (
        <div className="shopping-list">
          {list?.groups.map((group) => (
            group.items.length > 0 && (
              <div key={group.name} className="shopping-group">
                <h2 className="group-name">{group.name}</h2>
                <ul className="group-items">
                  {group.items.map((item) => (
                    <li key={item.ingredient.id} className={`shopping-item ${item.completed ? 'completed' : ''}`}>
                      <label className="item-label">
                        <input
                          type="checkbox"
                          className="item-checkbox"
                          checked={item.completed}
                          onChange={() => handleToggle(group, item)}
                        />
                        <span className="item-amount">
                          {item.ingredient.amount}
                          {item.ingredient.unit ? ` ${item.ingredient.unit}` : ''}
                        </span>
                        <span className="item-name">{item.ingredient.name}</span>
                      </label>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemove(group.name, item.ingredient.id)}
                        aria-label="Remove"
                      >
                        &#x2715;
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}
        </div>
      )}

      {confirmClear === 'all' && (
        <ConfirmDialog
          message="Clear all items from your shopping list?"
          onConfirm={handleClearAll}
          onCancel={() => setConfirmClear(null)}
        />
      )}
      {confirmClear === 'marked' && (
        <ConfirmDialog
          message={`Remove ${markedItems} checked item${markedItems !== 1 ? 's' : ''}?`}
          onConfirm={handleClearMarked}
          onCancel={() => setConfirmClear(null)}
        />
      )}
    </div>
  );
}
