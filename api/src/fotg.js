import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import logger from "morgan";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import monk from "monk";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { assertStrongJwtSecret } from "./secret.js";
import { redactQueryToken } from "./redact.js";

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "../../.env") });

assertStrongJwtSecret();

const db = monk(
  `${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST_NAME}:27017/${process.env.DB_NAME}?authSource=admin`,
);

db.then(() => {
  console.log(new Date().toISOString(), "database connected");
});

console.log(new Date().toISOString(), "starting", process.env.NODE_ENV, process.env.PORT);

var app = express();

// Rate limits key on the client IP, so behind a reverse proxy every request
// would otherwise share the proxy's IP and drain one bucket for all users. Set
// TRUST_PROXY_HOPS to the number of proxies in front of the API (1 for Caddy).
// Trusting a fixed hop count rather than `true` keeps X-Forwarded-For from being
// spoofable past that point.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0));

logger.token("safeUrl", (req) => redactQueryToken(req.originalUrl ?? req.url));
app.use(logger(":date[iso] :method :safeUrl :status :response-time ms"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1y", immutable: true }));

// CORS
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, PATCH, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Content-Length, X-Requested-With, X-Access-Token",
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Make our db accessible to our router
app.use(function (req, _res, next) {
  req.db = db;
  next();
});

import recipes from "./routes/recipes.js";
import recipe from "./routes/recipe.js";
import { router as token, tokenCheck } from "./routes/token.js";
import ingredientList from "./routes/ingredientList.js";
import mail from "./routes/mail.js";
import users from "./routes/users.js";

const swaggerDoc = require("../swagger_output.json");
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));

app.get("/health", async (_req, res) => {
  try {
    await db.executeWhenOpened();
    res.json({ success: true, db: "connected" });
  } catch {
    res.status(503).json({ success: false, db: "disconnected" });
  }
});

// These three are unauthenticated and are the ones worth hammering: credentials
// on /token, an admin-mail flood plus a set-password token oracle on /mail.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: { message: "Too many attempts. Try again later." } },
});

// A recipe id doubles as its share capability, so cap how fast ids can be walked.
// This is also the path authenticated users load recipes through, so the limit is
// set well above human browsing and only bites bulk enumeration.
const publicRecipeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, data: "Too many requests." },
});

app.use("/mail", authLimiter, mail);
app.use("/token", authLimiter, token);
app.use("/recipe", publicRecipeLimiter, recipe);
app.use(tokenCheck);
app.use("/ingredientList", ingredientList);
app.use("/recipes", recipes);
app.use("/users", users);

// catch 404 and forward to error handler
app.use(function (_req, _res, next) {
  var err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handler
app.use(function (err, req, res, _next) {
  const error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500).json({ message: err.message, error });
});

export default app;
