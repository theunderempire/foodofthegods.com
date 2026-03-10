import express from "express";
const router = express.Router();

/* GET home page. */
router.get("/", function (req, res, _next) {
  var message =
    process.env.NODE_ENV === "development"
      ? "dev server running"
      : "Recipe action, if you know how";
  res.json({ message });
});

export default router;
