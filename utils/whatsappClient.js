import makeWASocket from '@whiskeysockets/baileys';
import { useSingleFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createWhatsAppClient = async (phone, method, activeSessions) => {
    const sessionPath = path.join(__dirname, '../sessions', `${phone}.json`);
    const { state, saveState } = useSingleFileAuthState(sessionPath);

    const client = makeWASocket({
        auth: state,
        printQRInTerminal: method === 'qr',
        logger: { level: 'silent' }
    });

    const sessionData = {
        client: client,
        status: 'initializing',
        qrCode: null,
        pairingCode: null,
        isConnected: false,
        createdAt: new Date()
    };

    client.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr && method === 'qr') {
            sessionData.qrCode = await qrcode.toDataURL(qr);
            sessionData.status = 'qr_generated';
        }

        if (connection === 'open') {
            sessionData.status = 'connected';
            sessionData.isConnected = true;
            
            // Send session file to user
            await sendSessionFile(client, phone, sessionPath);
            
            // Cleanup after 10 seconds
            setTimeout(async () => {
                await client.logout();
                await client.end();
                activeSessions.delete(phone);
                await deleteSessionFiles(phone, sessionPath);
            }, 10000);
        }

        if (connection === 'close') {
            const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== 401;
            if (shouldReconnect) {
                sessionData.status = 'reconnecting';
            } else {
                sessionData.status = 'disconnected';
                sessionData.isConnected = false;
            }
        }
    });

    client.ev.on('creds.update', saveState);

    if (method === 'code') {
        try {
            const code = await client.requestPairingCode(phone.replace('+', ''));
            sessionData.pairingCode = code;
            sessionData.status = 'code_generated';
        } catch (error) {
            sessionData.status = 'error';
            throw error;
        }
    }

    return sessionData;
};

const sendSessionFile = async (client, phone, sessionPath) => {
    try {
        if (fs.existsSync(sessionPath)) {
            const sessionData = fs.readFileSync(sessionPath, 'utf8');
            const userJid = client.user.id;
            
            await client.sendMessage(userJid, {
                text: `Session file for ${phone}`
            });
            
            await client.sendMessage(userJid, {
                document: Buffer.from(sessionData),
                fileName: `whatsapp-session-${phone}.json`,
                mimetype: 'application/json'
            });
        }
    } catch (error) {
        console.error('Error sending session file:', error);
    }
};

const deleteSessionFiles = async (phone, sessionPath) => {
    try {
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
        }
    } catch (error) {
        console.error('Error deleting session files:', error);
    }
};
