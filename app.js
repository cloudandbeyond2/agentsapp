require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').Server(app);
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const agentRoutes = require('./routes/agentRoutes');
 
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const bcrypt = require('bcrypt'); // For hashing passwords
const path = require('path');
// Middleware
 
app.use(express.json()); // For JSON parsing
app.use(bodyParser.json()); // For parsing JSON requests
 
// CORS Configuration
const allowedOrigins = ['http://localhost:3000', 'https://your-deployed-app.com'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
 
// MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
 
// Routes
app.use('/api/addUsers', userRoutes);
app.use('/api/agents', agentRoutes);
 
// Handle unhandled routes
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});
 
// Centralized error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});
 
// Start the server
// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });
 
module.exports = app;