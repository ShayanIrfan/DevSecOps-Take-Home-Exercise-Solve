// Middleware for API key authentication
require("dotenv").config();

const authenticateAPIKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "No API key provided." });
  }

  const validApiKeys = JSON.parse(process.env.API_KEYS);
  if (!validApiKeys.includes(apiKey)) {
    return res.status(403).json({ error: "Invalid API key." });
  }

  next();
};

module.exports = { authenticateAPIKey };
