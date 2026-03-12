const connections = new Map(); // Map<userId, Set<res>>

export function subscribe(userId, res) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(res);
}

export function unsubscribe(userId, res) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connections.delete(userId);
}

export function broadcast(userId, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  connections.get(userId)?.forEach((res) => res.write(payload));
}
