import express from 'express';
import { authSession, verifySession, clearSession } from './controller.js';

const router = express.Router();

router.get('/auth', async (req, res) => {
  try {
    const { phone, mode = 'qr' } = req.query;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false,
        message: 'Phone number is required' 
      });
    }

    const result = await authSession(phone, mode);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

router.get('/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number is required' 
      });
    }

    let phoneNumber = phone.replace(/[^0-9]/g, '');
    const sessionId = `session_${phoneNumber}`;

    const result = await verifySession(sessionId);
    
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

router.delete(':phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const sessionId = `session_${phone.replace(/[^0-9]/g, '')}`;
    
    await clearSession(sessionId);
    
    res.json({
      success: true,
      message: 'Session cleared successfully'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

export default router;
