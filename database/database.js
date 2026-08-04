const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const databasePath = path.join(__dirname, "..", "database.db");

const database = new sqlite3.Database(databasePath, (error) => {
    if (error) {
        console.error("Failed to connect to SQLite:", error.message);
        return;
    }

    console.log("Connected to SQLite database.");
});

database.run("PRAGMA foreign_keys = ON");

module.exports = database;