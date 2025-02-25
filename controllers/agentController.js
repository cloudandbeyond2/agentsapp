const formidable = require('formidable');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
const Agent = require('../models/Agent');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { openCollection, closeConnection } = require("../config/db");
const { ObjectId } = require('mongodb');
// SAS Token and Blob Endpoint (from your provided connection string and token)
const AZURE_BLOB_ENDPOINT = process.env.AZURE_BLOB_ENDPOINT || "https://21l01l2025.blob.core.windows.net";
const AZURE_SAS_TOKEN = process.env.AZURE_SAS_TOKEN || "sv=2022-11-02&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2025-03-27T13:04:08Z&st=2025-01-27T05:04:08Z&spr=https,http&sig=tI1rxd6ULIw12AXwd4kwwSeprceMtIHxCiegyTS3GzQ%3D";
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || "agentfiles"; // Default container name

// Utility function to upload file to Azure Blob Storage
const uploadToAzure = async (filePath, fileType, blobName) => {
  try {
    const blobServiceClient = new BlobServiceClient(`${AZURE_BLOB_ENDPOINT}?${AZURE_SAS_TOKEN}`);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Ensure the container exists
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const stream = fs.createReadStream(filePath);

    // Upload the file
    await blockBlobClient.uploadStream(stream, undefined, undefined, {
      blobHTTPHeaders: { blobContentType: fileType },
    });

    console.log(`File uploaded to Azure: ${blockBlobClient.url}`);
    return blockBlobClient.url; // Return the file URL
  } catch (error) {
    console.error("Error uploading to Azure:", error.message);
    throw error;
  }
};

// Create a new agent
exports.createAgent = async (req, res) => {
  const form = new formidable.IncomingForm();
  form.keepExtensions = true;
  form.uploadDir = "/tmp"; // Use Vercel's writable directory

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error parsing form:", err.message);
      return res.status(400).json({ message: "Error parsing form", error: err.message });
    }

    try {
      // Debug uploaded files
      console.log("Uploaded files:", files);

      // Extract and validate fields
      const agentData = {};
      for (const key in fields) {
        agentData[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      }

      const requiredFields = ["firstName", "lastName", "email", "mobileNumber", "gender", "dateOfBirth"];
      for (const field of requiredFields) {
        if (!agentData[field]) {
          return res.status(400).json({ message: `Missing required field: ${field}` });
        }
      }

      // Check for duplicate email or mobile number
      const existingEmail = await Agent.findOne({ email: agentData.email });
      if (existingEmail) return res.status(400).json({ message: "Email already exists" });

      const existingMobile = await Agent.findOne({ mobileNumber: agentData.mobileNumber });
      if (existingMobile) return res.status(400).json({ message: "Mobile number already exists" });

      // Process file uploads
      const documentUploads = {};
      for (const key in files) {
        const fileArray = files[key]; // Formidable gives arrays for files
        if (!fileArray || fileArray.length === 0) {
          console.error(`No file provided for ${key}`);
          return res.status(400).json({ message: `No file provided for ${key}` });
        }

        const file = fileArray[0]; // Get the first file in the array
        if (!file.filepath) {
          console.error(`Filepath is missing for ${key}`);
          return res.status(400).json({ message: `Filepath is missing for ${key}` });
        }

        const blobName = `${key}-${uuidv4()}`;
        const fileUrl = await uploadToAzure(file.filepath, file.mimetype, blobName);
        documentUploads[`${key}FilePath`] = fileUrl;
      }

      // Combine agent data with document URLs
      Object.assign(agentData, documentUploads);

      // Assign a unique agent ID
      agentData.agentId = uuidv4();

      // Save the agent to the database
      const newAgent = new Agent(agentData);
      const savedAgent = await newAgent.save();

      // Clean up temporary files
      for (const key in files) {
        const fileArray = files[key];
        fileArray.forEach((file) => {
          if (file.filepath) {
            fs.unlinkSync(file.filepath);
          }
        });
      }

      res.status(201).json({ message: "Agent created successfully", agent: savedAgent });
    } catch (error) {
      console.error("Error creating agent:", error.message);
      res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
  });
};

// Get all agents
exports.getAgents = async (req, res) => {
  try {
    const agents = await Agent.find();
    res.status(200).json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};

// Get a specific agent by ID
exports.getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await Agent.findById(id);

    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.status(200).json(agent);
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};

// Update an agent
exports.updateAgent = async (req, res) => {
  const uploadsDir = path.join('/tmp', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const form = new formidable.IncomingForm();
  form.uploadDir = uploadsDir; // Temporary upload location
  form.keepExtensions = true; // Retain file extensions

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(400).json({ message: 'File upload error', error: err.message });
    }

    try {
      const { id } = req.params;

      // Fetch the agent by ID to ensure it exists
      const existingAgent = await Agent.findById(id);
      if (!existingAgent) {
        return res.status(404).json({ message: 'Agent not found' });
      }

      const updatedData = fields;

      // Process file uploads
      const documentUploads = {};
      for (const [key, file] of Object.entries(files)) {
        const blobName = `${key}-${uuidv4()}`;
        documentUploads[`${key}FilePath`] = await uploadToAzure(file, blobName);
      }

      // Merge uploaded document URLs with updated data
      Object.assign(updatedData, documentUploads);

      // Update the agent in the database
      const updatedAgent = await Agent.findByIdAndUpdate(id, updatedData, { new: true });

      res.status(200).json({ message: 'Agent updated successfully', agent: updatedAgent });
    } catch (error) {
      console.error('Error updating agent:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  });
};

exports.updateAgentById = async (req, res) => {
  const { id } = req.params; // Use userId passed in the request params
  const updatedData = req.body;
  console.log(id,updatedData,"123")

  try {
    const collection = await openCollection('agents');
    const result = await collection.updateOne(
      { _id: new ObjectId(id) }, // Match based on userId
      { $set: updatedData }
    );

    if (result.matchedCount > 0) {
      res.status(200).json({ message: 'Agent updated successfully' });
    } else {
      res.status(404).json({ message: 'Agent not found' });
    }
  } catch (error) {
    console.error('Error updating Agent:', error);
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};

// Delete an agent
exports.deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedAgent = await Agent.findByIdAndDelete(id);

    if (!deletedAgent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    res.status(200).json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Internal Server Error', error });
  }
};
