// Secrets are loaded from .env.* files via dotenv (see src/fotg.js).
// This file is kept for reference but no longer imported.
const config = {
  get secret() {
    return process.env.JWT_SECRET;
  },
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY;
  },
};

export default config;
