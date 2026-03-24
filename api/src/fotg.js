import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import logger from "morgan";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import monk from "monk";
import swaggerUi from "swagger-ui-express";

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "../../.env") });

const db = monk(
  `${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST_NAME}:27017/${process.env.DB_NAME}?authSource=admin`,
);

db.then(() => {
  console.log(new Date().toISOString(), "database connected");
});

console.log(new Date().toISOString(), "starting", process.env.NODE_ENV, process.env.PORT);

var app = express();

app.use(logger(":date[iso] :method :url :status :response-time ms"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

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

app.use("/mail", mail);
app.use("/token", token);
app.use("/recipe", recipe);
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
