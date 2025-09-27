import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch, mkdirSync, writeFileSync } from 'fs';
import path, { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import pn from 'awesome-phonenumber';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, 
      makeCacheableSignalKeyStore, makeWALegacySocket, makeWASocket, 
      Browsers, jidNormalizedUser, PHONENUMBER_MCC } = await import('@whiskeysockets/baileys');

const sessionFolder = "tmp";
const sessions = new Map();

// Function to remove files or directories
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class WhatsAppSession {
    constructor(sessionId, phoneNumber = null) {
        this.sessionId = sessionId;
        this.phoneNumber = phoneNumber;
        this.conn = null;
        this.qrCode = null;
        this.pairingCode = null;
        this.status = 'disconnected';
        this.isConnected = false;
        this.userJid = null;
        this.authPath = join(__dirname, sessionFolder, this.sessionId);
        this.qrGenerated = false;
        this.responseSent = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }

    async initialize(mode = 'qr') {
        // Remove existing session if present
        await removeFile(this.authPath);

        // Validate phone number if provided (for code mode)
        if (mode === 'code' && this.phoneNumber) {
            const phoneObj = pn('+' + this.phoneNumber);
            if (!phoneObj.isValid()) {
                throw new Error('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, 84987654321 for Vietnam, etc.) without + or spaces.');
            }
            this.phoneNumber = phoneObj.getNumber('e164').replace('+', '');
        }

        // Ensure session directory exists
        if (!existsSync(this.authPath)) {
            mkdirSync(this.authPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version, isLatest } = await fetchLatestBaileysVersion();

        const socketConfig = {
            version,
            logger: pino({ level: 'silent' }),
            browser: mode === 'qr' ? Browsers.windows('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            printQRInTerminal: mode === 'qr',
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 250,
            maxRetries: 5,
        };

        this.conn = makeWASocket(socketConfig);
        
        this.conn.ev.on('connection.update', (update) => this.handleConnectionUpdate(update, mode));
        this.conn.ev.on('creds.update', saveCreds);

        // If not registered and mode is code, request pairing code
        if (!state.creds.registered && mode === 'code' && this.phoneNumber) {
            await delay(3000);
            return await this.requestPairingCode();
        }

        return this.conn;
    }

    async handleConnectionUpdate(update, mode) {
        const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;

        if (qr && !this.qrGenerated && mode === 'qr') {
            this.qrGenerated = true;
            this.qrCode = qr;
            this.status = 'qr_ready';
            
            console.log('🟢 QR Code Generated! Scan it with your WhatsApp app.');
            console.log('📋 Instructions:');
            console.log('1. Open WhatsApp on your phone');
            console.log('2. Go to Settings > Linked Devices');
            console.log('3. Tap "Link a Device"');
            console.log('4. Scan the QR code below');
            
            // Display QR in terminal
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (isNewLogin) {
            console.log("🔐 New login via pair code");
        }

        if (isOnline) {
            console.log("📶 Client is online");
        }

        if (connection === 'open') {
            this.status = 'connected';
            this.isConnected = true;
            this.userJid = this.conn.user.id;
            this.phoneNumber = this.conn.user.id.split('@')[0]; // Extract phone from JID
            console.log(`✅ Session ${this.sessionId} connected successfully!`);
            
            // Send session files after successful connection
            await this.sendSessionFiles();
        }

        if (connection === 'close') {
            console.log('❌ Connection closed');
            if (lastDisconnect?.error) {
                console.log('❗ Last Disconnect Error:', lastDisconnect.error);
            }
            
            this.status = 'disconnected';
            this.isConnected = false;
            
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            
            if (statusCode === 401) {
                console.log('🔐 Logged out - need new QR code');
                this.status = 'logged_out';
                await this.cleanup();
            } else if (statusCode === 515 || statusCode === 503) {
                console.log(`🔄 Stream error (${statusCode}) - attempting to reconnect...`);
                this.reconnectAttempts++;
                
                if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                    console.log(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                    this.status = 'reconnecting';
                    // Wait a bit before reconnecting
                    setTimeout(async () => {
                        try {
                            await this.initialize(mode);
                        } catch (err) {
                            console.error('Failed to reconnect:', err);
                        }
                    }, 2000);
                } else {
                    console.log('❌ Max reconnect attempts reached');
                    this.status = 'failed';
                    await this.cleanup();
                }
            } else {
                console.log('🔄 Connection lost');
                this.status = 'disconnected';
            }
        }
    }

    async requestPairingCode() {
        if (!this.conn || !this.phoneNumber) return null;
        
        try {
            let code = await this.conn.requestPairingCode(this.phoneNumber);
            this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(`Pairing code generated for ${this.phoneNumber}: ${this.pairingCode}`);
            return this.pairingCode;
        } catch (error) {
            console.error('Error requesting pairing code:', error);
            throw new Error('Failed to get pairing code. Please check your phone number and try again.');
        }
    }

    async getQRCodeDataURL() {
        if (!this.qrCode) return null;
        
        try {
            return await qrcode.toDataURL(this.qrCode, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
        } catch (error) {
            console.error('Error generating QR code data URL:', error);
            return null;
        }
    }

    async sendSessionFiles() {
        if (!this.isConnected || !this.userJid) {
            console.log('Cannot send session files: Not connected or user JID not available');
            return;
        }

        try {
            console.log("📱 Sending session file to user...");
            
            // Read creds.json file
            const credsPath = join(this.authPath, 'creds.json');
            if (!existsSync(credsPath)) {
                throw new Error('creds.json file not found');
            }

            const sessionKnight = readFileSync(credsPath);

            // Send session file to user
            await this.conn.sendMessage(this.userJid, {
                document: sessionKnight,
                mimetype: 'application/json',
                fileName: 'creds.json'
            });
            console.log("📄 Session file sent successfully");

            // Send video thumbnail with caption (optional)
			/*
            try {
                await this.conn.sendMessage(this.userJid, {
                    image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
                    caption: `🎬 *KnightBot MD V2.0 Full Setup Guide!*\n\n🚀 Bug Fixes + New Commands + Fast AI Chat\n📺 Watch Now: https://youtu.be/-oz_u1iMgf8`
                });
                console.log("🎬 Video guide sent successfully");
            } catch (imageError) {
                console.log("⚠️ Could not send image, continuing...");
            }
			*/

            // Send warning message
            await this.conn.sendMessage(this.userJid, {
                text: `*Do not share this file with anybody*\n  ┌────────────┈ ⳹
┌┤✑  Thanks for using *WhatsApp Session*
│└────────────┈ ⳹        
│©2020 Centre The End
└─────────────────┈ ⳹\n\n> Support: https://whatsapp.com/channel/0029Vb5u2oNJ3juwGBYtXF1G`
            });
            console.log("⚠️ Warning message sent successfully");

            // Send completion message
            await this.conn.sendMessage(this.userJid, {
                text: `Session setup completed successfully!\n\nSession files have been sent. You can now use these files to authenticate.\n\nSession ID: ${this.sessionId}\n\n⚠️ Keep these files secure!`
            });

            console.log("🎉 All messages sent successfully");

            // Clean up session after use
            console.log("🧹 Cleaning up session...");
            await delay(5000); // Wait 5 seconds before cleanup
            await this.cleanup();
            console.log("✅ Session cleaned up successfully");
            
        } catch (error) {
            console.error("❌ Error sending messages:", error);
            
            // Try to send error message
            try {
                if (this.conn && this.userJid) {
                    await this.conn.sendMessage(this.userJid, {
                        text: `Error sending session files: ${error.message}\n\nPlease try reconnecting.`
                    });
                }
            } catch (msgError) {
                console.error('Failed to send error message:', msgError);
            }
            
            // Still clean up session even if sending fails
            await this.cleanup();
        }
    }

    async clearSessionFiles() {
        try {
            if (existsSync(this.authPath)) {
                readdirSync(this.authPath).forEach(file => {
                    unlinkSync(join(this.authPath, file));
                });
                // Remove the directory itself
                try {
                    unlinkSync(this.authPath);
                } catch (e) {
                    // Directory might not be empty, ignore error
                }
            }
            sessions.delete(this.sessionId);
            console.log(`Session files cleared for ${this.sessionId}`);
        } catch (error) {
            console.error('Error clearing session files:', error);
        }
    }

    async cleanup() {
        await this.clearSessionFiles();
        if (this.conn) {
            try {
                this.conn.end();
                console.log(`Connection closed for ${this.sessionId}`);
            } catch (error) {
                console.error('Error closing connection:', error);
            }
        }
    }

    getStatus() {
        return {
            status: this.status,
            isConnected: this.isConnected,
            qrCode: this.qrCode,
            pairingCode: this.pairingCode,
            userJid: this.userJid,
            phoneNumber: this.phoneNumber,
            sessionId: this.sessionId
        };
    }
}

async function authSession(phone = null, method = 'qr') {
    let sessionId;
    let phoneNumber = phone ? phone.replace(/[^0-9]/g, '') : null;

    if (method === 'code') {
        if (!phoneNumber) {
            throw new Error('Phone number is required for code authentication');
        }

        // Validate phone number using awesome-phonenumber
        const phoneObj = pn('+' + phoneNumber);
        if (!phoneObj.isValid()) {
            throw new Error('Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, 84987654321 for Vietnam, etc.) without + or spaces.');
        }

        phoneNumber = phoneObj.getNumber('e164').replace('+', '');
        sessionId = `session_${phoneNumber}`;
    } else {
        // For QR mode, generate unique session ID
        sessionId = `qr_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Check if session already exists
    if (sessions.has(sessionId)) {
        const existingSession = sessions.get(sessionId);
        const status = existingSession.getStatus();
        
        if (status.isConnected) {
            return {
                sessionId,
                connected: true,
                message: 'Session is already connected'
            };
        }
        
        // If QR code exists but not connected, return current status
        if (status.qrCode) {
            const qrDataURL = await existingSession.getQRCodeDataURL();
            return {
                sessionId,
                qrCode: qrDataURL,
                message: 'QR code is ready for scanning',
                instructions: [
                    '1. Open WhatsApp on your phone',
                    '2. Go to Settings > Linked Devices',
                    '3. Tap "Link a Device"',
                    '4. Scan the QR code above'
                ]
            };
        }
        
        return status;
    }

    // Create new session
    const session = new WhatsAppSession(sessionId, phoneNumber);
    sessions.set(sessionId, session);

    await session.initialize(method);

    if (method === 'code') {
        const pairingCode = await session.requestPairingCode();
        return {
            sessionId,
            pairingCode,
            message: 'Use this code to pair your device',
			instructions: [
            '1. Open WhatsApp on your phone',
            '2. Go to Settings > Linked Devices',
            '3. Tap "Link a Device"',
			'4. Tap "Link with phone number instead"',
            '5. Add pairingCode'
          ]
        };
    }

    // For QR mode, generate and return QR code
    let qrDataURL = null;
    if (session.qrCode) {
        qrDataURL = await session.getQRCodeDataURL();
    }

    return {
        sessionId,
        qrCode: qrDataURL,
        message: 'Scan the QR code with WhatsApp',
        instructions: [
            '1. Open WhatsApp on your phone',
            '2. Go to Settings > Linked Devices',
            '3. Tap "Link a Device"',
            '4. Scan the QR code above'
        ]
    };
}

async function verifySession(sessionId) {
    if (!sessions.has(sessionId)) {
        // Check if session files exist but session object doesn't
        const sessionPath = join(__dirname, sessionFolder, sessionId);
        if (existsSync(sessionPath)) {
            return {
                authenticated: false,
                message: 'Session exists but not active. Please reconnect.',
                sessionExists: true
            };
        }
        throw new Error('Session not found');
    }

    const session = sessions.get(sessionId);
    const status = session.getStatus();

    if (status.isConnected) {
        return {
            authenticated: true,
            message: 'Session is successfully connected and files are being sent',
            sessionReady: true,
            userJid: status.userJid,
            phoneNumber: status.phoneNumber,
            sessionId: status.sessionId
        };
    }

    // If QR code exists but not connected
    if (status.qrCode) {
        const qrDataURL = await session.getQRCodeDataURL();
        return {
            authenticated: false,
            message: 'QR code is ready for scanning',
            qrCode: qrDataURL,
            status: status.status
        };
    }

    return {
        authenticated: false,
        message: 'Session not yet authenticated',
        ...status
    };
}

async function clearSession(sessionId) {
    if (sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        await session.cleanup();
    } else {
        // Clear files directly if session object doesn't exist
        const sessionPath = join(__dirname, sessionFolder, sessionId);
        removeFile(sessionPath);
    }
}

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("Stream Errored (restart required)")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export { authSession, verifySession, clearSession };
