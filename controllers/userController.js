const { openCollection, closeConnection } = require("../config/db");
const { ObjectId } = require("mongodb");
const { v4: uuidv4 } = require('uuid');
 
// Create Item
exports.createUser = async (req, res) => {
  const { username, email, officialEmail, role, password,confirmPassword } = req.body;
 
  // Validate required fields
  if (!username || !email || !officialEmail || !role || !password) {
    console.log("Validation error: Missing fields");
    return res.status(400).json({ message: 'All fields are required.' });
  }
 
  try {
    // Ensure connection is opened correctly
    const collection = await openCollection('add_users');
   
    // Check if user with the same email already exists
    const existingEmail = await collection.findOne({ email: email });
    const existingOfcEmail = await collection.findOne({ officialEmail: officialEmail });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists. Please use a different email.' });
    }
    if (existingOfcEmail) {
      return res.status(400).json({ message: 'Official Email already exists. Please use a different email.' });
    }
 
    const user = {
      userId: uuidv4(), // Use uuid to generate a unique userId
      username,
      email,
      officialEmail,
      role,
      password,
      confirmPassword
    };
 
    // Insert user
    const result = await collection.insertOne(user);
    res.status(201).json({
      message: 'User created successfully',
      userId: result.insertedId,
    });
  } catch (error) {
    console.error('Error creating user:', error); // Log the full error for debugging
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};
 
 
 
// Read All Items
exports.getUser = async (req, res) => {
  try {
    const collection = await openCollection("add_users"); // Ensure `openCollection` is correctly implemented
    const users = await collection.find().toArray();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Error retrieving users", error });
  }
};
 
// Update Item
// Update User
exports.updateUser = async (req, res) => {
  const { userId } = req.params; // Use userId passed in the request params
  const updatedData = req.body;

  try {
    const collection = await openCollection('add_users');
    const result = await collection.updateOne(
      { userId }, // Match based on userId
      { $set: updatedData }
    );

    if (result.matchedCount > 0) {
      res.status(200).json({ message: 'User updated successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};


// Delete User
exports.deleteUser = async (req, res) => {
  const { userId } = req.params; // Retrieve the userId from request params

  try {
    const collection = await openCollection("add_users");
    const result = await collection.deleteOne({ userId }); // Delete based on userId

    if (result.deletedCount > 0) {
      res.status(200).json({ message: "User deleted successfully" });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Error deleting user", error });
  }
};

 