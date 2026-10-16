const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("Welcome to the Node.js and Express server");
});

app.get("/about", (req, res) => {
  res.status(200).json({
    name: "Parasa Sandeep Samuel",
    section: "CSE FSD 2B"
  });
});

app.get("/time", (req, res) => {
  res.status(200).send(new Date().toString());
});

app.use((req, res) => {
  res.status(404).send("404 Not Found: the requested route does not exist");
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
