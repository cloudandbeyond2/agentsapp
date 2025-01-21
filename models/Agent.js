const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  agentId: { type: String, unique: true, required: true },
  firstName: String,
  lastName: String,
  email: { type: String, unique: true },
  mobileNumber: { type: String, unique: true, required: true }, // Added mobileNumber
  gender: String,
  dateOfBirth: Date,
  aadharFilePath: String,
  panFilePath: String,
  voterIdFilePath: String,
  address: {
    street: String,
    wardNumber: String,
    constituency: String,
    city: String,
    state: String,
    postCode: String,
    country: String,
  },
});

module.exports = mongoose.model('Agent', agentSchema);
