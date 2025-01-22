const formidable = require('formidable');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
const Agent = require('../models/Agent');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Azure Blob Storage Configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'agentfiles'; // Azure Blob container name

/**
 * Uploads a file to Azure Blob Storage.
 * @param {object} file - The file object.
 * @param {string} blobName - The unique blob name.
 * @returns {string} - The URL of the uploaded file.
 */
const uploadToAzure = async (file, blobName) => {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

    // Ensure the container exists
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const stream = fs.createReadStream(file.filepath);

    await blockBlobClient.uploadStream(stream, file.size, undefined, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    return blockBlobClient.url;
  } catch (error) {
    console.error('Error uploading to Azure:', error);
    throw new Error('Failed to upload file to Azure Blob Storage.');
  }
};

/**
 * Creates a new agent.
 */
exports.createAgent = async (req, res) => {
  const uploadsDir = path.join('/tmp', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const form = new formidable.IncomingForm();
  form.uploadDir = uploadsDir;
  form.keepExtensions = true;

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Formidable error:', err);
      return res.status(400).json({ message: 'Form parsing error', error: err.message });
    }

    try {
      // Parse fields
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

      // Check for duplicates
      const existingEmail = await Agent.findOne({ email: agentData.email });
      if (existingEmail) return res.status(400).json({ message: 'Email already exists' });

      const existingMobile = await Agent.findOne({ mobileNumber: agentData.mobileNumber });
      if (existingMobile) return res.status(400).json({ message: 'Mobile number already exists' });

      // Upload files to Azure Blob Storage
      const documentUploads = {};
      for (const [key, fileArray] of Object.entries(files)) {
        const file = fileArray[0];
        if (file && file.filepath) {
          const blobName = `${key}-${uuidv4()}`;
          documentUploads[`${key}FilePath`] = await uploadToAzure(file, blobName);
        }
      }

      // Add uploaded file URLs and unique agentId
      Object.assign(agentData, documentUploads);
      agentData.agentId = uuidv4();

      // Save the agent to MongoDB
      const newAgent = new Agent(agentData);
      const savedAgent = await newAgent.save();

      res.status(201).json({ message: 'Agent created successfully', agent: savedAgent });
    } catch (error) {
      console.error('Error creating agent:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  });
};

/**
 * Retrieves all agents.
 */
exports.getAgents = async (req, res) => {
  try {
    const agents = await Agent.find();
    res.status(200).json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

/**
 * Retrieves a specific agent by ID.
 */
exports.getAgentById = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await Agent.findById(id);

    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    res.status(200).json(agent);
  } catch (error) {
    console.error('Error fetching agent by ID:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

/**
 * Updates an agent.
 */
exports.updateAgent = async (req, res) => {
  const uploadsDir = path.join('/tmp', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const form = new formidable.IncomingForm();
  form.uploadDir = uploadsDir;
  form.keepExtensions = true;

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ message: 'Form parsing error', error: err.message });

    try {
      const { id } = req.params;
      const existingAgent = await Agent.findById(id);

      if (!existingAgent) return res.status(404).json({ message: 'Agent not found' });

      const updatedData = fields;
      const documentUploads = {};

      // Upload files to Azure Blob Storage
      for (const [key, fileArray] of Object.entries(files)) {
        const file = fileArray[0];
        if (file && file.filepath) {
          const blobName = `${key}-${uuidv4()}`;
          documentUploads[`${key}FilePath`] = await uploadToAzure(file, blobName);
        }
      }

      Object.assign(updatedData, documentUploads);
      const updatedAgent = await Agent.findByIdAndUpdate(id, updatedData, { new: true });

      res.status(200).json({ message: 'Agent updated successfully', agent: updatedAgent });
    } catch (error) {
      console.error('Error updating agent:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  });
};

/**
 * Deletes an agent.
 */
exports.deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAgent = await Agent.findByIdAndDelete(id);

    if (!deletedAgent) return res.status(404).json({ message: 'Agent not found' });

    res.status(200).json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};
