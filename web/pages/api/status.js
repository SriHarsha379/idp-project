// pages/api/status.js

import axios from 'axios';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5000';
const CELERY_STATUS_BASE_URL = `${PYTHON_API_URL}/api/tasks/status`;

export default async function handler(req, res) {
  const { taskId } = req.query;

  if (!taskId) {
    return res.status(400).json({ message: 'Task ID is required.' });
  }

  try {
    // 1. Request the status from the Python API wrapper
    const response = await axios.get(`${CELERY_STATUS_BASE_URL}/${taskId}`);

    // 2. Forward the status and result
    return res.status(200).json(response.data);

  } catch (error) {
    console.error(`Error checking status for task ${taskId}:`, error);
    return res.status(500).json({ message: 'Failed to check task status.', details: error.message });
  }
}