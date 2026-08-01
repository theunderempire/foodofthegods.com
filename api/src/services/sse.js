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
  const subscribers = connections.get(userId);
  if (!subscribers) return { delivered: 0, dropped: 0 };

  const dead = [];
  let delivered = 0;

  // Writing to a closed socket throws. broadcast is called from request handlers
  // that have already persisted a change and often already responded, so an
  // unguarded throw turned one stale connection into a failed mutation — and
  // because a Set iterates in insertion order, every connection behind the dead
  // one silently missed the event.
  for (const res of subscribers) {
    try {
      res.write(payload);
      delivered += 1;
    } catch {
      dead.push(res);
    }
  }

  // Without pruning, a leaked connection keeps failing on every future broadcast.
  for (const res of dead) unsubscribe(userId, res);

  if (dead.length) {
    console.warn(`[sse] dropped ${dead.length} dead connection(s) for user="${userId}"`);
  }

  return { delivered, dropped: dead.length };
}
