import express from 'express';
import { 
    createSession, 
    getSessionStatus, 
    deleteSession,
    getActiveSessions,
    adminStats 
} from '../controllers/sessionController.js';

const router = express.Router();

// Public routes
router.get('/session/create', createSession);
router.get('/session/status/:phone', getSessionStatus);
router.delete('/session/delete/:phone', deleteSession);

// Admin routes
router.get('/admin/sessions', getActiveSessions);
router.get('/admin/stats', adminStats);

export default router;
