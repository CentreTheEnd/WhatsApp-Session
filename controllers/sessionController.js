import { createWhatsAppClient, deleteSessionFiles } from '../utils/whatsappClient.js';

const activeSessions = new Map();

export const createSession = async (req, res) => {
    try {
        const { phone, method = 'qr' } = req.query;
        
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Validate phone number format
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ 
                error: 'Invalid phone number format. Use international format: +1234567890' 
            });
        }

        if (activeSessions.has(phone)) {
            const existingSession = activeSessions.get(phone);
            return res.status(400).json({ 
                error: 'Session already in progress for this number',
                status: existingSession.status 
            });
        }

        if (method !== 'qr' && method !== 'code') {
            return res.status(400).json({ error: 'Method must be either "qr" or "code"' });
        }

        console.log(`Creating session for ${phone} with method: ${method}`);

        const clientData = await createWhatsAppClient(phone, method, activeSessions);
        activeSessions.set(phone, clientData);

        // Set timeout to automatically clean up stuck sessions after 10 minutes
        setTimeout(() => {
            if (activeSessions.has(phone) && !clientData.isConnected) {
                console.log(`Auto-cleaning stuck session for ${phone}`);
                activeSessions.delete(phone);
                deleteSessionFiles(phone);
            }
        }, 10 * 60 * 1000);

        res.json({ 
            success: true,
            status: 'initiated', 
            message: `Session creation started for ${phone}`,
            method: method,
            phone: phone
        });
    } catch (error) {
        console.error('Session creation error:', error);
        res.status(500).json({ 
            error: 'Failed to create session',
            details: error.message 
        });
    }
};

export const getSessionStatus = async (req, res) => {
    try {
        const { phone } = req.params;
        const session = activeSessions.get(phone);

        if (!session) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }

        const response = {
            phone: phone,
            status: session.status,
            isConnected: session.isConnected,
            timestamp: new Date().toISOString()
        };

        if (session.qrCode) {
            response.qrCode = session.qrCode;
        }

        if (session.pairingCode) {
            response.pairingCode = session.pairingCode;
        }

        if (session.error) {
            response.error = session.error;
        }

        res.json(response);
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const deleteSession = async (req, res) => {
    try {
        const { phone } = req.params;
        const session = activeSessions.get(phone);

        if (session) {
            try {
                await session.client.logout();
                await session.client.end();
            } catch (error) {
                console.error('Error during logout:', error);
            }
            activeSessions.delete(phone);
            await deleteSessionFiles(phone);
        }

        res.json({ 
            success: true,
            message: `Session for ${phone} deleted successfully` 
        });
    } catch (error) {
        console.error('Session deletion error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getActiveSessions = async (req, res) => {
    try {
        const sessions = Array.from(activeSessions.entries()).map(([phone, data]) => ({
            phone,
            status: data.status,
            isConnected: data.isConnected,
            createdAt: data.createdAt,
            method: data.pairingCode ? 'code' : 'qr'
        }));

        res.json({ 
            success: true,
            sessions: sessions,
            total: sessions.length 
        });
    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({ error: error.message });
    }
};

export const adminStats = async (req, res) => {
    try {
        const sessions = Array.from(activeSessions.values());
        const stats = {
            totalActiveSessions: activeSessions.size,
            connectedSessions: sessions.filter(s => s.isConnected).length,
            pendingSessions: sessions.filter(s => !s.isConnected).length,
            qrSessions: sessions.filter(s => !s.pairingCode).length,
            codeSessions: sessions.filter(s => s.pairingCode).length
        };

        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
};
