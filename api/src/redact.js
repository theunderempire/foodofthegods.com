// The SSE client has to pass its JWT in the query string because EventSource
// cannot set request headers. Without redaction, morgan's :url writes a valid,
// still-usable token to stdout on every stream connect — and into any
// reverse-proxy access log in front of the API.
export function redactQueryToken(url) {
  return String(url).replace(/([?&](?:token|access_token)=)[^&]*/gi, "$1[redacted]");
}
