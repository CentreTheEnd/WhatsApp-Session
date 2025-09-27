import { createWhatsAppClient } from '../utils/whatsappClient.js';
import { deleteSessionFiles } from '../utils/fileManager.js';

const activeSessions = new Map();

export const createSession = async (req, res) => {
    try {
        const { phone, method = 'qr' } = req.query;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        if (activeSessions.has(phone)) {
            return res.status(400).json({ error: 'Session already in progress for this number' });
        }

        const client = await createWhatsAppClient(phone, method, activeSessions);
        activeSessions.set(phone, client);

        res.json({ 
            status: 'initiated', 
            message: `Session creation started for ${phone}`,
            method: method 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getSessionStatus = async (req, res) => {
    try {
        const { phone } = req.params;
        const session = activeSessions.get(phone);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({
            phone: phone,
            status: session.status,
            qrCode: session.qrCode,
            pairingCode: session.pairingCode,
            isConnected: session.isConnected
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteSession = async (req, res) => {
    try {
        const { phone } = req.params;
        const session = activeSessions.get(phone);

        if (session) {
            await session.client.logout();
            await session.client.end();
            activeSessions.delete(phone);
            await deleteSessionFiles(phone);
        }

        res.json({ message: `Session for ${phone} deleted successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getActiveSessions = async (req, res) => {
    try {
        const sessions = Array.from(activeSessions.entries()).map(([phone, data]) => ({
            phone,
            status: data.status,
            isConnected: data.isConnected,
            createdAt: data.createdAt
        }));

        res.json({ sessions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const adminStats = async (req, res) => {
    try {
        const stats = {
            totalActiveSessions: activeSessions.size,
            connectedSessions: Array.from(activeSessions.values()).filter(s => s.isConnected).length,
            pendingSessions: Array.from(activeSessions.values()).filter(s => !s.isConnected).length
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
