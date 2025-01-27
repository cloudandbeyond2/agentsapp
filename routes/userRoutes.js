const express = require("express");
const { createUser, getUser, updateUser, deleteUser,loginUser } = require("../controllers/userController");
 
const router = express.Router();
 
router.post("/saveCreateUser", createUser);
router.get("/getUser", getUser);
router.put("/updateUser/:userId", updateUser);
router.delete("/deleteUser/:userId", deleteUser);
router.post("/login", loginUser);

module.exports = router;