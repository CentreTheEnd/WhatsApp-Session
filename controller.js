import express from 'express';
import { createSession, clearSession, getSessionStatus, getQRCode } from './service.js';
import qrcode from 'qrcode';

const router = express.Router();

// إضافة timeout للطلبات
const REQUEST_TIMEOUT = 30000; // 30 ثانية

router.get('/create', async (req, res) => {
    // إعداد timeout للطلب
    const timeout = setTimeout(() => {
        res.status(408).json({
            success: false,
            error: 'Request timeout'
        });
    }, REQUEST_TIMEOUT);

    try {
        const { number, method = 'code' } = req.query;

        if (!number) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required',
                example: '/session/create?number=+201012345678'
            });
        }

        // تحقق أكثر صرامة من رقم الهاتف
        if (!number.match(/^\+\d{10,15}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format. Must start with + and have 10-15 digits',
                example: '+201012345678'
            });
        }

        console.log(`Creating session for: ${number} with method: ${method}`);

        const result = await createSession(number, method);
        
        const response = {
            success: true,
            number: number,
            method: method,
            timestamp: new Date().toISOString(),
            ...result
        };

        // إضافة رابط QR إذا كانت الطريقة QR
        if (method === 'qr') {
            response.qrUrl = `${req.protocol}://${req.get('host')}/session/qr-image`;
            response.qrDataUrl = `${req.protocol}://${req.get('host')}/session/qr-data`;
        }

        console.log('Session created successfully:', response.status);
        res.json(response);

    } catch (error) {
        console.error('Error creating session:', error);
        
        let statusCode = 500;
        let errorMessage = 'Failed to create session';
        
        if (error.message.includes('Invalid phone number')) {
            statusCode = 400;
            errorMessage = error.message;
        } else if (error.message.includes('Too many attempts')) {
            statusCode = 429;
            errorMessage = error.message;
        } else if (error.message.includes('Connection Closed')) {
            errorMessage = 'WhatsApp connection failed. Please check the phone number and try again.';
        }

        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        clearTimeout(timeout);
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
                error: 'QR code not available. Please create a session first with method=qr'
            });
        }

        const qrImage = await qrcode.toBuffer(qrData, {
            width: 300,
            height: 300,
            margin: 2,
            errorCorrectionLevel: 'H'
        });

        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        res.send(qrImage);

    } catch (error) {
        console.error('Error generating QR image:', error);
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
            qrUrl: `${req.protocol}://${req.get('host')}/session/qr-image`,
            message: 'Use this QR code to link your WhatsApp account'
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
            timestamp: new Date().toISOString(),
            ...result
        });
    } catch (error) {
        console.error('Error clearing session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear session'
        });
    }
});

// إضافة endpoint للتحقق من صحة الرقم
router.get('/validate-number/:number', (req, res) => {
    const { number } = req.params;
    
    const isValid = /^\+\d{10,15}$/.test(number);
    
    res.json({
        success: true,
        number: number,
        isValid: isValid,
        message: isValid ? 'Valid phone number format' : 'Invalid format. Must start with + and have 10-15 digits'
    });
});

router.get('/info', (req, res) => {
    res.json({
        success: true,
        service: 'WhatsApp Session Manager',
        version: '1.0.0',
        endpoints: {
            'create_session': 'GET /session/create?number=+201012345678&method=code|qr',
            'session_status': 'GET /session/status',
            'qr_image': 'GET /session/qr-image',
            'qr_data': 'GET /session/qr-data',
            'clear_session': 'DELETE /session/clear',
            'validate_number': 'GET /session/validate-number/+201012345678'
        },
        notes: [
            'Phone number must include country code (e.g., +20 for Egypt)',
            'Session files are automatically sent to your WhatsApp after successful connection',
            'Sessions are automatically cleaned up after 10 seconds'
        ]
    });
});

export default router;
