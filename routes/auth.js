import express from 'express';
import { requestPairingCode } from '../controllers/whatsappController.js';

const router = express.Router();

router.get('/session', async (req, res) => {
  try {
    const { phone, mode = 'qr' } = req.query;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    const result = await requestPairingCode(phone, mode);
    res.json(result);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message
    });
  }
});

export default router;
