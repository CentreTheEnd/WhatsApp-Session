import express from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import { 
  getActiveSessions, 
  terminateSession, 
  getSystemStats 
} from '../controllers/whatsappController.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await getActiveSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/sessions/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    await terminateSession(phone);
    res.json({ success: true, message: 'Session terminated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await getSystemStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
