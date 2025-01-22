const formidable = require('formidable');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
const Agent = require('../models/Agent');
const { v4: uuidv4 } = require('uuid');
const path = require('path');


// Azure Blob Storage Configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = "agentfiles"; // Azure container name

// Utility function to upload a file to Azure Blob Storage
const uploadToAzure = async (filePath, fileType, blobName) => {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Ensure the container exists
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const stream = require("fs").createReadStream(filePath);

    // Upload the file
    await blockBlobClient.uploadStream(stream, undefined, undefined, {
      blobHTTPHeaders: { blobContentType: fileType },
    });

    console.log(`File uploaded to Azure: ${blockBlobClient.url}`);
    return blockBlobClient.url; // Return the file URL
  } catch (error) {
    console.error("Error uploading to Azure:", error.message);
    throw new Error("Failed to upload file to Azure");
  }
};

// Create Agent Function
exports.createAgent = async (req, res) => {
  const form = new formidable.IncomingForm({ multiples: true });
  form.uploadDir = "./temp"; // Temporary directory for uploads
  form.keepExtensions = true; // Keep file extensions

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error parsing form:", err.message);
      return res.status(400).json({ message: "File upload error", error: err.message });
    }

    try {
      // Normalize fields: Convert arrays to single values
      const normalizedFields = {};
      for (const key in fields) {
        normalizedFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      }

      // Validate required fields
      const requiredFields = ["firstName", "lastName", "email", "mobileNumber", "gender", "dateOfBirth"];
      for (const field of requiredFields) {
        if (!normalizedFields[field]) {
          return res.status(400).json({ message: `Missing required field: ${field}` });
        }
      }

      // Check for duplicate email or mobile number
      const existingEmail = await Agent.findOne({ email: normalizedFields.email });
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      const existingMobile = await Agent.findOne({ mobileNumber: normalizedFields.mobileNumber });
      if (existingMobile) {
        return res.status(400).json({ message: "Mobile number already exists" });
      }

      // Process and upload files
      const documentUploads = {};
      for (const [key, file] of Object.entries(files)) {
        if (file && file.filepath) {
          const blobName = `${key}-${uuidv4()}`;
          const fileUrl = await uploadToAzure(file.filepath, file.mimetype, blobName);
          documentUploads[`${key}FilePath`] = fileUrl; // Save the file URL
        }
      }

      // Merge uploaded file URLs with agent data
      const agentData = {
        ...normalizedFields,
        ...documentUploads,
        agentId: uuidv4(), // Assign a unique ID
        address: {
          street: normalizedFields.street,
          wardNumber: normalizedFields.wardNumber,
          constituency: normalizedFields.constituency,
          city: normalizedFields.city,
          state: normalizedFields.state,
          postCode: normalizedFields.postCode,
          country: normalizedFields.country,
        },
      };

      // Save agent to the database
      const newAgent = new Agent(agentData);
      const savedAgent = await newAgent.save();

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
