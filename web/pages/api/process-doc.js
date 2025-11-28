// pages/api/process-doc.js

import formidable from 'formidable';
import { promises as fs } from 'fs';
import axios from 'axios';
import path from 'path';

// Disable Next.js body parser for formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

// Use the internal URL for the Python API (from .env file)
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5000';
const CELERY_SUBMIT_URL = `${PYTHON_API_URL}/api/process-doc`; // ✅ FIXED

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const tempUploadDir = path.join(process.cwd(), 'temp_uploads');
  await fs.mkdir(tempUploadDir, { recursive: true });

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB
    uploadDir: tempUploadDir,
    keepExtensions: true,
  });

  let file;

  try {
    const [fields, files] = await form.parse(req);
    file = files.document[0];

    // Read the uploaded PDF file content
    const fileBuffer = await fs.readFile(file.filepath);
    const fileBase64 = fileBuffer.toString('base64');

    // Send the task to Python API
    const celeryResponse = await axios.post(CELERY_SUBMIT_URL, {
      file_content_b64: fileBase64,
      original_filename: file.originalFilename,
    });

    // Clean up temp file
    await fs.unlink(file.filepath).catch((e) =>
      console.error('Failed to clean up temp file:', e)
    );

    // Return task info
    return res.status(200).json({
      message: 'Processing started successfully.',
      taskId: celeryResponse.data.taskId || celeryResponse.data.task_id,
    });
  } catch (error) {
    console.error('File upload or Celery submission error:', error);

    if (file && file.filepath) {
      await fs.unlink(file.filepath).catch(() => {});
    }

    return res.status(500).json({
      message: 'Failed to start processing.',
      error: error.message,
      details: error.response?.data || 'Check backend logs.',
    });
  }
};

export default handler;
