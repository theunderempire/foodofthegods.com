const secret = {
  get superSecret() {
    return process.env.JWT_SECRET;
  },
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY;
  },
};

export default secret;
