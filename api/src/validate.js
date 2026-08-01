// Request bodies are attacker-controlled JSON. A value like {"$ne": null} is
// truthy, so a presence check alone lets a Mongo query operator through to the
// driver — monk only casts `_id` fields. Anything interpolated into a query
// must be confirmed to be a string.
export function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
