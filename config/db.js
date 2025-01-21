const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");

dotenv.config();

const MONGO_URI = process.env.MONGO_URI; // Your MongoDB URI

let db = null; // To cache the database connection

const openCollection = async (collectionName) => {
  if (!db) {
    const client = new MongoClient(MONGO_URI); // No need for deprecated options
    await client.connect();
    db = client.db(); // Use default database from the URI
  }
  return db.collection(collectionName); // Return the specified collection
};

const closeConnection = async () => {
  if (db) {
    await db.client.close(); // Ensure proper cleanup
    db = null; // Reset the db cache
  }
};

module.exports = { openCollection, closeConnection };
