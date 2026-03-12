/**
 * Creates a mock Express response object that tracks status and body.
 */
export function makeRes() {
  const res = { _status: 200, _body: null };
  res.status = (code) => {
    res._status = code;
    return res;
  };
  res.json = (data) => {
    res._body = data;
    return res;
  };
  res.send = (data) => {
    res._body = data;
    return res;
  };
  return res;
}

/**
 * Creates a mock monk collection. Pass `overrides` to replace specific methods
 * with tracked or custom implementations.
 */
export function makeCollection(overrides = {}) {
  return {
    find: (_query, _opts) => Promise.resolve([]),
    findOne: (_query, _opts) => Promise.resolve({}),
    insert: (doc) => Promise.resolve({ ...doc, _id: "mock-id-123" }),
    update: (_query, _update) => Promise.resolve(),
    remove: (_query) => Promise.resolve(),
    ...overrides,
  };
}

/**
 * Creates a mock Express request object with a decoded JWT and a mock db.
 *
 * @param {object} options
 * @param {string} options.username - value of req.decoded.username
 * @param {object} options.body    - req.body
 * @param {object} options.params  - req.params
 * @param {object} options.collections - map of collection name → mock collection
 */
export function makeReq({ username = "testuser", body = {}, params = {}, collections = {} } = {}) {
  return {
    decoded: { username },
    body,
    params,
    db: { get: (name) => collections[name] ?? makeCollection() },
  };
}
