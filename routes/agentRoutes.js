const express = require('express');
const {
  createAgent,
  getAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
} = require('../controllers/agentController');

const router = express.Router();

router.post('/create', createAgent);
router.get('/', getAgents);
router.get('/:id', getAgentById);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

module.exports = router;
