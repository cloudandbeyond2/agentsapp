const formidable = require('formidable');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
const Agent = require('../models/Agent');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Azure Blob Storage Configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = 'agentfiles'; // Replace with your container name

// Utility function to upload file to Azure Blob Storage
const uploadToAzure = async (fileBuffer, mimeType, blobName) => {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file buffer directly
    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    console.log(`File uploaded to Azure: ${blobName}`);
    return blockBlobClient.url; // Return the URL of the uploaded file
  } catch (error) {
    console.error('Error uploading to Azure:', error.message);
    throw error;
  }
};

// Create a new agent
exports.createAgent = async (req, res) => {
  const form = new formidable.IncomingForm({ multiples: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err.message);
      return res.status(400).json({ message: 'File upload error', error: err.message });
    }

    try {
      // Normalize fields: Extract single value if it's an array
      const normalizedFields = {};
      for (const key in fields) {
        normalizedFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      }

      // Extract agent data from normalized fields
      const agentData = { ...normalizedFields };

      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'email', 'mobileNumber', 'gender', 'dateOfBirth'];
      for (const field of requiredFields) {
        if (!agentData[field]) {
          return res.status(400).json({ message: `Missing required field: ${field}` });
        }
      }

      // Check for duplicate email or mobile number
      const existingEmail = await Agent.findOne({ email: agentData.email });
      if (existingEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      const existingMobile = await Agent.findOne({ mobileNumber: agentData.mobileNumber });
      if (existingMobile) {
        return res.status(400).json({ message: 'Mobile number already exists' });
      }

      // Process and upload files
      const documentUploads = {};
      for (const [key, file] of Object.entries(files)) {
        if (file && file.filepath) {
          const blobName = `${key}-${uuidv4()}`;
          const fileBuffer = file._writeBuffer; // Access file buffer from formidable
          const fileUrl = await uploadToAzure(fileBuffer, file.mimetype, blobName);
          documentUploads[`${key}FilePath`] = fileUrl; // Save the file URL
        }
      }

      // Merge uploaded files URLs with agent data
      Object.assign(agentData, documentUploads);

      // Generate a unique agent ID
      agentData.agentId = uuidv4();

      // Save agent to the database
      const newAgent = new Agent(agentData);
      const savedAgent = await newAgent.save();

      res.status(201).json({ message: 'Agent created successfully', agent: savedAgent });
    } catch (error) {
      console.error('Error creating agent:', error.message);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
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
