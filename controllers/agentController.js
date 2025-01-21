const formidable = require('formidable');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
const Agent = require('../models/Agent');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Azure Blob Storage Configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = '21l01l2025'; // Replace with your Azure Blob container name

// Utility function to upload file to Azure Blob Storage
const uploadToAzure = async (file, blobName) => {
  const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = 'agentfiles';

  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    const createContainerResponse = await containerClient.createIfNotExists();
    if (createContainerResponse.succeeded) {
      console.log(`Container ${containerName} created successfully.`);
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const stream = fs.createReadStream(file.filepath);
    await blockBlobClient.uploadStream(stream, file.size, undefined, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
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
  const form = new formidable.IncomingForm();
  form.uploadDir = './uploads'; // Directory for temporary file storage
  form.keepExtensions = true;  // Retain file extensions
  form.on('fileBegin', (name, file) => {
    file.filepath = `${form.uploadDir}/${file.newFilename}`; // Proper filepath
  });

  // Ensure the uploads directory exists
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('File upload error:', err.message);
      return res.status(400).json({ message: 'File upload error', error: err.message });
    }

    console.log('Fields received:', fields);
    console.log('Files received:', files);

    try {
      // Parse fields to extract single values from arrays
      const agentData = {};
      Object.keys(fields).forEach((key) => {
        agentData[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      });

      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'email', 'mobileNumber', 'gender', 'dateOfBirth'];
      for (const field of requiredFields) {
        if (!agentData[field]) {
          return res.status(400).json({ message: `Missing required field: ${field}` });
        }
      }

      // Check if email or mobile number already exists
      const existingEmail = await Agent.findOne({ email: agentData.email });
      if (existingEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      const existingMobile = await Agent.findOne({ mobileNumber: agentData.mobileNumber });
      if (existingMobile) {
        return res.status(400).json({ message: 'Mobile number already exists' });
      }

      // Process file uploads
      const documentUploads = {};
      for (const [key, fileArray] of Object.entries(files)) {
        const file = fileArray[0];
        if (!file || !file.filepath) {
          console.error(`File ${key} is invalid or not uploaded.`);
          continue;
        }

        try {
          const blobName = `${key}-${uuidv4()}`;
          const fileUrl = await uploadToAzure(file, blobName);
          documentUploads[`${key}FilePath`] = fileUrl;
        } catch (error) {
          console.error(`Error uploading file ${key}:`, error.message);
        }
      }

      // Merge uploaded document URLs with agent data
      Object.assign(agentData, documentUploads);

      // Generate and assign a unique UUID
      agentData.agentId = uuidv4();

      // Save new agent
      const newAgent = new Agent(agentData);
      const savedAgent = await newAgent.save();

      res.status(201).json({ message: 'Agent created successfully', agent: savedAgent });
    } catch (error) {
      console.error('Error creating agent:', error);
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
  const form = new formidable.IncomingForm();
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
