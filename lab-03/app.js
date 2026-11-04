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

const SORT_COLUMNS = {
  id: "id",
  title: "title",
  author: "author",
  price: "price",
  pages: "pages",
};

const MAX_LIMIT = 100;
const MAX_PRICE = 2147483647;

class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const single = (query, name, fallback) => {
  const value = query[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  if (Array.isArray(value)) {
    throw new BadRequest(`${name} must be given only once`);
  }
  return value;
};

const wholeNumber = (query, name, fallback, min, max) => {
  const raw = single(query, name, undefined);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequest(`${name} must be a whole number between ${min} and ${max}`);
  }
  return value;
};

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new BadRequest("bookId must be a positive whole number");
  }
  return id;
};

const checkBook = (body) => {
  const { title, author, price, pages } = body || {};
  const isText = (v) => typeof v === "string" && v.trim().length > 0;
  const isCount = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (!isText(title)) {
    throw new BadRequest("title is required and must be non-empty text");
  }
  if (!isText(author)) {
    throw new BadRequest("author is required and must be non-empty text");
  }
  if (!isCount(price)) {
    throw new BadRequest("price is required and must be a whole number, zero or more");
  }
  if (!isCount(pages)) {
    throw new BadRequest("pages is required and must be a whole number, zero or more");
  }
  return { title: title.trim(), author: author.trim(), price, pages };
};

app.get("/books/", async (request, response) => {
  const query = request.query;
  const searchQ = single(query, "search_q", "");
  const orderByName = String(single(query, "order_by", "id")).toLowerCase();
  const orderName = String(single(query, "order", "ASC")).toUpperCase();
  const limit = wholeNumber(query, "limit", 10, 1, MAX_LIMIT);
  const offset = wholeNumber(query, "offset", 0, 0, MAX_PRICE);
  const minPrice = wholeNumber(query, "min_price", 0, 0, MAX_PRICE);
  const maxPrice = wholeNumber(query, "max_price", MAX_PRICE, 0, MAX_PRICE);

  if (!Object.prototype.hasOwnProperty.call(SORT_COLUMNS, orderByName)) {
    throw new BadRequest(`order_by must be one of: ${Object.keys(SORT_COLUMNS).join(", ")}`);
  }
  if (orderName !== "ASC" && orderName !== "DESC") {
    throw new BadRequest("order must be ASC or DESC");
  }
  if (minPrice > maxPrice) {
    throw new BadRequest("min_price must not be greater than max_price");
  }

  const sortColumn = SORT_COLUMNS[orderByName];
  const getBooksQuery = `
    SELECT * FROM book
    WHERE title LIKE ? ESCAPE '\\'
      AND price BETWEEN ? AND ?
    ORDER BY ${sortColumn} ${orderName}
    LIMIT ? OFFSET ?;`;
  const books = await db.all(getBooksQuery, [`%${searchQ.replace(/[\\%_]/g, "\\$&")}%`, minPrice, maxPrice, limit, offset]);
  response.status(200).json(books);
});

app.get("/books/:bookId/", async (request, response) => {
  const bookId = parseId(request.params.bookId);
  const getBookQuery = `
    SELECT * FROM book WHERE id = ?;`;
  const book = await db.get(getBookQuery, [bookId]);
  if (book === undefined) {
    return response.status(404).json({ message: "Book not found" });
  }
  response.status(200).json(book);
});

app.post("/books/", async (request, response) => {
  const { title, author, price, pages } = checkBook(request.body);
  const addBookQuery = `
    INSERT INTO book (title, author, price, pages)
    VALUES (?, ?, ?, ?);`;
  const dbResponse = await db.run(addBookQuery, [title, author, price, pages]);
  response.status(201).json({ message: "Book added", bookId: dbResponse.lastID });
});

app.put("/books/:bookId/", async (request, response) => {
  const bookId = parseId(request.params.bookId);
  const { title, author, price, pages } = checkBook(request.body);
  const updateBookQuery = `
    UPDATE book
    SET title = ?, author = ?, price = ?, pages = ?
    WHERE id = ?;`;
  const dbResponse = await db.run(updateBookQuery, [title, author, price, pages, bookId]);
  if (dbResponse.changes === 0) {
    return response.status(404).json({ message: "Book not found" });
  }
  response.status(200).json({ message: "Book updated" });
});

app.delete("/books/:bookId/", async (request, response) => {
  const bookId = parseId(request.params.bookId);
  const deleteBookQuery = `
    DELETE FROM book WHERE id = ?;`;
  const dbResponse = await db.run(deleteBookQuery, [bookId]);
  if (dbResponse.changes === 0) {
    return response.status(404).json({ message: "Book not found" });
  }
  response.status(200).json({ message: "Book deleted" });
});

app.use((request, response) => {
  response.status(404).json({ message: "Route not found" });
});

app.use((error, request, response, next) => {
  if (error.type === "entity.parse.failed") {
    return response.status(400).json({ message: "Request body is not valid JSON" });
  }
  const status = error.status || 500;
  if (status === 500) {
    console.log(error.message);
    return response.status(500).json({ message: "Internal server error" });
  }
  response.status(status).json({ message: error.message });
});
