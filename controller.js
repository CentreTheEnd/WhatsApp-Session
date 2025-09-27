import express from 'express';
import { createSession, clearSession, getSessionStatus, getQRCode } from './service.js';
import qrcode from 'qrcode';

const router = express.Router();

router.get('/create', async (req, res) => {
    try {
        const { number, method = 'code' } = req.query;

        if (!number) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required',
                example: '/session/create?number=+201*********'
            });
        }

        /*
        if (!number.match(/^\+\d{10,15}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format',
                example: '+201*********'
            });
        }
        */

        const result = await createSession(number, method);
        
        const response = {
            success: true,
            number: number,
            method: method,
            ...result
        };

        if (method === 'qr' && result.status === 'initialized') {
            response.qrUrl = `https://${req.get('host')}/session/qr-image`;
        }

        res.json(response);

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to create session',
            details: error.message
        });
    }
});

router.get('/status', (req, res) => {
    try {
        const status = getSessionStatus();
        
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get session status'
        });
    }
});

router.get('/qr-image', async (req, res) => {
    try {
        const qrData = await getQRCode();
        
        if (!qrData) {
            return res.status(404).json({
                success: false,
                error: 'QR code not available'
            });
        }

        const qrImage = await qrcode.toBuffer(qrData, {
            width: 300,
            height: 300,
            margin: 2
        });

        res.set('Content-Type', 'image/png');
        res.send(qrImage);

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate QR code image'
        });
    }
});

router.get('/qr-data', async (req, res) => {
    try {
        const qrData = await getQRCode();
        
        if (!qrData) {
            return res.status(404).json({
                success: false,
                error: 'QR code not available'
            });
        }

        res.json({
            success: true,
            qrCode: qrData,
            qrUrl: `https://${req.get('host')}/session/qr-image`
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get QR code data'
        });
    }
});

router.delete('/clear', async (req, res) => {
    try {
        const result = await clearSession();
        
        res.json({
            success: true,
            message: 'Session cleared successfully',
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to clear session',
            details: error.message
        });
    }
});

router.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'WhatsApp Session Manager',
        version: '1.0.0',
        endpoints: {
            'create_session': 'GET /session/create?number=+201012345678&method=code|qr',
            'session_status': 'GET /session/status',
            'qr_image': 'GET /session/qr-image',
            'qr_data': 'GET /session/qr-data',
            'clear_session': 'DELETE /session/clear'
        },
        methods: {
            qr: 'QR code authentication',
            code: '8-digit code authentication'
        }
    });
});

export default router;
