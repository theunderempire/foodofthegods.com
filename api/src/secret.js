export const MIN_JWT_SECRET_LENGTH = 32;

// Every authorization decision in this app reduces to comparing a username taken
// from a verified JWT, so a guessable signing secret is full impersonation of any
// user. Checked at startup so a deploy that forgets to supply the real secret
// fails loudly instead of serving traffic with forgeable tokens.
export function assertStrongJwtSecret(value = process.env.JWT_SECRET) {
  if (typeof value !== "string" || value.length < MIN_JWT_SECRET_LENGTH) {
    const got = typeof value === "string" ? `${value.length} characters` : "not set";
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (${got}). Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
}

const secret = {
  get superSecret() {
    return process.env.JWT_SECRET;
  },
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY;
  },
};

export default secret;
