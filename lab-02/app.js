const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "books.db");
const PORT = process.env.PORT || 3000;

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const validateBook = (body) => {
  const { title, author, price, pages } = body || {};
  const validText = (v) => typeof v === "string" && v.trim().length > 0;
  const validNumber = (v) => Number.isInteger(v) && v >= 0;
  if (!validText(title) || !validText(author)) {
    return "title and author must be non-empty text";
  }
  if (!validNumber(price) || !validNumber(pages)) {
    return "price and pages must be whole numbers, zero or more";
  }
  return null;
};

app.get("/books/", async (request, response) => {
  const getBooksQuery = `
    SELECT * FROM book ORDER BY id;`;
  const booksArray = await db.all(getBooksQuery);
  response.status(200).json(booksArray);
});

app.get("/books/:bookId/", async (request, response) => {
  const bookId = parseId(request.params.bookId);
  if (bookId === null) {
    return response.status(400).json({ error: "bookId must be a positive whole number" });
  }
  const getBookQuery = `
    SELECT * FROM book WHERE id = ?;`;
  const book = await db.get(getBookQuery, [bookId]);
  if (book === undefined) {
    return response.status(404).json({ error: "Book not found" });
  }
  response.status(200).json(book);
});

app.post("/books/", async (request, response) => {
  const problem = validateBook(request.body);
  if (problem) {
    return response.status(400).json({ error: problem });
  }
  const { title, author, price, pages } = request.body;
  const addBookQuery = `
    INSERT INTO book (title, author, price, pages)
    VALUES (?, ?, ?, ?);`;
  const dbResponse = await db.run(addBookQuery, [title.trim(), author.trim(), price, pages]);
  response.status(201).json({ message: "Book added", bookId: dbResponse.lastID });
});

app.put("/books/:bookId/", async (request, response) => {
  const bookId = parseId(request.params.bookId);
  if (bookId === null) {
    return response.status(400).json({ error: "bookId must be a positive whole number" });
  }
  const problem = validateBook(request.body);
  if (problem) {
    return response.status(400).json({ error: problem });
  }
  const { title, author, price, pages } = request.body;
  const updateBookQuery = `
    UPDATE book
    SET title = ?, author = ?, price = ?, pages = ?
    WHERE id = ?;`;
  const dbResponse = await db.run(updateBookQuery, [title.trim(), author.trim(), price, pages, bookId]);
  if (dbResponse.changes === 0) {
    return response.status(404).json({ error: "Book not found" });
  }
  response.status(200).json({ message: "Book updated" });
});

app.delete("/books/:bookId/", async (request, response) => {
  const bookId = parseId(request.params.bookId);
  if (bookId === null) {
    return response.status(400).json({ error: "bookId must be a positive whole number" });
  }
  const deleteBookQuery = `
    DELETE FROM book WHERE id = ?;`;
  const dbResponse = await db.run(deleteBookQuery, [bookId]);
  if (dbResponse.changes === 0) {
    return response.status(404).json({ error: "Book not found" });
  }
  response.status(200).json({ message: "Book deleted" });
});

app.use((request, response) => {
  response.status(404).json({ error: "Route not found" });
});

app.use((error, request, response, next) => {
  const status = error.status || 500;
  const message = status === 500 ? "Internal server error" : "Invalid request body";
  if (status === 500) {
    console.log(error.message);
  }
  response.status(status).json({ error: message });
});
