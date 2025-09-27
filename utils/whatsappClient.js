import makeWASocket from '@whiskeysockets/baileys';
import { useSingleFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple logger that satisfies Baileys requirements
const makeLogger = (phone) => ({
    level: 'silent',
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
    child: () => makeLogger(phone) // Return a similar object for child logger
});

export const createWhatsAppClient = async (phone, method, activeSessions) => {
    const sessionPath = path.join(__dirname, '../sessions', `${phone}.json`);
    
    // Ensure sessions directory exists
    const sessionsDir = path.join(__dirname, '../sessions');
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const { state, saveState } = useSingleFileAuthState(sessionPath);

    const client = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR display ourselves
        logger: makeLogger(phone),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        linkPreviewImageThumbnailWidth: 192,
        generateHighQualityLinkPreview: false,
        defaultQueryTimeoutMs: 60000,
        version: [2, 2413, 1] // Use a stable WhatsApp version
    });

    const sessionData = {
        client: client,
        status: 'initializing',
        qrCode: null,
        pairingCode: null,
        isConnected: false,
        createdAt: new Date().toISOString()
    };

    client.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        console.log(`[${phone}] Connection update:`, connection);

        if (qr) {
            if (method === 'qr') {
                // Generate QR code for web display
                try {
                    sessionData.qrCode = await qrcode.toDataURL(qr);
                    sessionData.status = 'qr_generated';
                } catch (error) {
                    console.error('QR generation error:', error);
                }
                
                // Also show in terminal
                qrcodeTerminal.generate(qr, { small: true });
                console.log(`[${phone}] QR code generated`);
            }
        }

        if (connection === 'open') {
            console.log(`[${phone}] Connected successfully`);
            sessionData.status = 'connected';
            sessionData.isConnected = true;
            
            // Send session file to user
            await sendSessionFile(client, phone, sessionPath);
            
            // Cleanup after 10 seconds
            setTimeout(async () => {
                try {
                    await client.logout();
                    await client.end();
                    activeSessions.delete(phone);
                    await deleteSessionFiles(phone, sessionPath);
                    console.log(`[${phone}] Session cleaned up`);
                } catch (error) {
                    console.error(`[${phone}] Cleanup error:`, error);
                }
            }, 10000);
        }

        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`[${phone}] Connection closed, status code:`, statusCode);
            
            if (statusCode !== 401) { // 401 means logged out
                sessionData.status = 'reconnecting';
            } else {
                sessionData.status = 'disconnected';
                sessionData.isConnected = false;
            }
        }
    });

    client.ev.on('creds.update', saveState);

    client.ev.on('messages.upsert', () => {
        // Handle messages if needed
    });

    // Request pairing code if method is 'code'
    if (method === 'code') {
        try {
            // Remove any non-digit characters except +
            const cleanPhone = phone.replace(/[^\d+]/g, '');
            const code = await client.requestPairingCode(cleanPhone);
            sessionData.pairingCode = code;
            sessionData.status = 'code_generated';
            console.log(`[${phone}] Pairing code:`, code);
        } catch (error) {
            console.error(`[${phone}] Pairing code error:`, error);
            sessionData.status = 'error';
            sessionData.error = error.message;
        }
    }

    return sessionData;
};

const sendSessionFile = async (client, phone, sessionPath) => {
    try {
        if (fs.existsSync(sessionPath)) {
            const sessionData = fs.readFileSync(sessionPath, 'utf8');
            const userJid = client.user.id;
            
            // Send notification message
            await client.sendMessage(userJid, {
                text: `✅ WhatsApp session created successfully!\n\nPhone: ${phone}\n\nYour session file is attached below. Save this file to maintain your session.`
            });
            
            // Send session file
            await client.sendMessage(userJid, {
                document: Buffer.from(sessionData),
                fileName: `whatsapp-session-${phone}.json`,
                mimetype: 'application/json'
            });

            console.log(`[${phone}] Session file sent successfully`);
        } else {
            console.error(`[${phone}] Session file not found at:`, sessionPath);
        }
    } catch (error) {
        console.error(`[${phone}] Error sending session file:`, error);
    }
};

export const deleteSessionFiles = async (phone, sessionPath) => {
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            console.log(`[${phone}] Session files deleted`);
        }
    } catch (error) {
        console.error(`[${phone}] Error deleting session files:`, error);
    }
};
