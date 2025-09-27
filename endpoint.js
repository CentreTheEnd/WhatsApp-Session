import express from 'express';
import { authSession, verifySession, clearSession } from './controller.js';

const router = express.Router();


router.get('/auth', async (req, res) => {
  try {
    const { phone, mode = 'qr' } = req.query;
    
    if (mode === 'qr' && !phone) {
      const result = await authSession(null, mode);
      
      return res.json({
        success: true,
        ...result
      });
    }
    
    if (!phone) {
      return res.status(400).json({ 
        success: false,
        message: 'Phone number is required for code authentication' 
      });
    }

    const result = await authSession(phone, mode);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Auth error:', error);
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
        message: 'Phone number or session ID is required' 
      });
    }

    let sessionId;
    if (phone.startsWith('session_') || phone.startsWith('qr_session_')) {
      sessionId = phone;
    } else {
      let phoneNumber = phone.replace(/[^0-9]/g, '');
      sessionId = `session_${phoneNumber}`;
    }

    const result = await verifySession(sessionId);
    
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Verify session error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

router.delete('/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Phone number or session ID is required' 
      });
    }

    let sessionId;
    if (phone.startsWith('session_') || phone.startsWith('qr_session_')) {
      sessionId = phone;
    } else {
      let phoneNumber = phone.replace(/[^0-9]/g, '');
      sessionId = `session_${phoneNumber}`;
    }

    await clearSession(sessionId);
    
    res.json({
      success: true,
      message: 'Session cleared successfully'
    });

  } catch (error) {
    console.error('Clear session error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'WhatsApp Session Generator API',
    endpoints: {
      auth: 'GET /session/auth?phone=[number]&mode=[qr|code]',
      verify: 'GET /session/[phone|sessionId]',
      delete: 'DELETE /session/[phone|sessionId]'
    },
    version: '1.0.0'
  });
});

export default router;
