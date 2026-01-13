var express = require("express");
var path = require("path");
var logger = require("morgan");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");

require("dotenv").config({
  path: path.join(__dirname, `../.env.${process.env.NODE_ENV}`),
});

var monk = require("monk");
var db = monk(
  `${process.env.DB_HOST_NAME}:27017/${process.env.DB_SERVICE_NAME}`
);

db.then(() => {
  console.log("database connected");
});

console.log("!starting", process.env.NODE_ENV, process.env.PORT);

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Make our db accessible to our router
app.use(function (req, _res, next) {
  req.db = db;
  next();
});

app.all("/*", function (_req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, PUT, POST, PATCH, DELETE, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Content-Length, X-Requested-With, X-Access-Token"
  );
  next();
});

var index = require("./routes/index");
var recipes = require("./routes/recipes");
var recipe = require("./routes/recipe");
var tokenCheck = require("./routes/token").tokenCheck;
var token = require("./routes/token").router;
var ingredientList = require("./routes/ingredientList");
var mail = require("./routes/mail");

app.use("/", index);
app.use("/mail", mail);
app.use("/token", token);
app.use("/recipe", recipe);
app.use(tokenCheck);
app.use("/ingredientList", ingredientList);
app.use("/recipes", recipes);

// catch 404 and forward to error handler
app.use(function (_req, _res, next) {
  var err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// error handler
app.use(function (err, req, res) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
