const express = require("express");
const { listSubjects } = require("../data/subjects");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ subjects: listSubjects() });
});

module.exports = router;
