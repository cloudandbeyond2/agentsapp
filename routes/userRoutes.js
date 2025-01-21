const express = require("express");
const { createUser, getUser, updateUser, deleteUser } = require("../controllers/userController");
 
const router = express.Router();
 
router.post("/saveCreateUser", createUser);
router.get("/getUser", getUser);
router.put("/updateUser/:userId", updateUser);
router.delete("/deleteUser/:userId", deleteUser);
 
module.exports = router;