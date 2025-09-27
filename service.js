import { existsSync, mkdirSync, readdirSync, unlinkSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let authFolderName = "sessions";
let conn = null;
let sessionStatus = {
    isConnected: false,
    qrCode: null,
    pairingCode: null,
    user: null,
    error: null
};

function verificationAuthFolder() {
    const authFolder = join(__dirname, authFolderName);
    if (!existsSync(authFolder)) {
        mkdirSync(authFolder, { recursive: true });
    }
}

export async function createSession(phoneNumber, method = 'code') {
    try {
        verificationAuthFolder();
        const authFolder = join(__dirname, authFolderName);

        // تنظيف الجلسة السابقة
        await clearSession();

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const { version, isLatest } = await fetchLatestBaileysVersion();

        console.log(`Using WhatsApp version: ${version}, isLatest: ${isLatest}`);

        const connectionOptions = {
            logger: Pino({ level: 'silent' }),
            printQRInTerminal: method === 'qr',
            auth: {
                creds: state.creds,
                keys: state.keys,
            },
            version,
            browser: ['Chrome', 'Windows', '10.0.0'],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 3000
            },
            getMessage: async (key) => {
                return null;
            }
        };

        conn = makeWASocket(connectionOptions);

        // إعداد معالج الأحداث قبل أي شيء
        setupEventHandlers(conn, saveCreds, phoneNumber, method);

        // الانتظار قليلاً لبدء الاتصال
        await new Promise(resolve => setTimeout(resolve, 1000));

        // إذا كان الطريقة code ولم يكن مسجل بعد
        if (method === 'code' && !state.creds.registered) {
            try {
                console.log('Requesting pairing code for:', phoneNumber);
                const pairingCode = await createCode(phoneNumber);
                sessionStatus.pairingCode = pairingCode;
                console.log('Pairing code generated:', pairingCode);
                
                return { 
                    status: 'code_required', 
                    code: pairingCode,
                    message: 'Use this code in WhatsApp Linked Devices'
                };
            } catch (error) {
                console.error('Error generating pairing code:', error);
                throw error;
            }
        }

        return { 
            status: 'initialized', 
            method,
            message: 'Session initialized successfully'
        };

    } catch (error) {
        console.error('Error in createSession:', error);
        sessionStatus.error = error.message;
        
        // تنظيف في حالة الخطأ
        await clearSession();
        
        throw error;
    }
}

function setupEventHandlers(conn, saveCreds, phoneNumber, method) {
    console.log('Setting up event handlers...');

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        
        console.log('Connection update:', { connection, qr: !!qr, isNewLogin });

        if (qr) {
            sessionStatus.qrCode = qr;
            console.log('QR code received');
            
            if (method === 'qr') {
                // طباعة QR في terminal للتصحيح
                const qrcode = await import('qrcode-terminal');
                qrcode.generate(qr, { small: true });
            }
        }

        if (connection === 'open') {
            console.log('✅ Connection opened successfully');
            sessionStatus.isConnected = true;
            sessionStatus.user = conn.user;
            
            // إرسال ملف الجلسة
            await sendSessionFile(phoneNumber);
            
            // تنظيف بعد 10 ثواني
            setTimeout(() => {
                clearSession();
            }, 10000);
        }

        if (connection === 'close') {
            console.log('Connection closed', lastDisconnect);
            
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const error = lastDisconnect?.error;
            
            console.log('Disconnect status code:', statusCode);
            console.log('Disconnect error:', error);

            if (statusCode === DisconnectReason.loggedOut) {
                console.log('Logged out from WhatsApp');
                sessionStatus.isConnected = false;
                sessionStatus.user = null;
                
                // تنظيف الملفات
                const authFolder = join(__dirname, authFolderName);
                if (existsSync(authFolder)) {
                    const files = readdirSync(authFolder);
                    for (const file of files) {
                        unlinkSync(join(authFolder, file));
                    }
                }
            }
            
            if (statusCode === DisconnectReason.restartRequired) {
                console.log('Restart required, reconnecting...');
                // يمكن إضافة إعادة الاتصال هنا إذا لزم الأمر
            }
        }

        // حفظ بيانات الاعتماد
        conn.ev.on('creds.update', saveCreds);
    });

    // معالج أخطاء إضافي
    conn.ev.on('creds.update', saveCreds);
    
    conn.ev.on('messages.upsert', (data) => {
        console.log('Messages upsert:', data.messages.length, 'messages');
    });

    // معالج لأخطاء الاتصال
    conn.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        sessionStatus.error = error.message;
    });

    conn.ws.on('close', (code, reason) => {
        console.log('WebSocket closed:', code, reason);
        sessionStatus.isConnected = false;
    });
}

export async function clearSession() {
    try {
        console.log('Cleaning up session...');
        
        if (conn) {
            try {
                if (conn.ws && conn.ws.readyState === conn.ws.OPEN) {
                    await conn.logout();
                    conn.ws.close();
                }
            } catch (error) {
                console.error('Error closing connection:', error);
            }
            conn = null;
        }

        // تنظيف ملفات الجلسة
        const authFolder = join(__dirname, authFolderName);
        if (existsSync(authFolder)) {
            const files = readdirSync(authFolder);
            for (const file of files) {
                try {
                    unlinkSync(join(authFolder, file));
                } catch (error) {
                    console.error('Error deleting file:', file, error);
                }
            }
            console.log('Session files cleaned up');
        }

        // إعادة تعيين حالة الجلسة
        sessionStatus = {
            isConnected: false,
            qrCode: null,
            pairingCode: null,
            user: null,
            error: null
        };

        return { success: true, message: 'Session cleared successfully' };
    } catch (error) {
        console.error('Error in clearSession:', error);
        throw error;
    }
}

export function getSessionStatus() {
    return {
        ...sessionStatus,
        isActive: conn !== null,
        timestamp: new Date().toISOString()
    };
}

async function sendSessionFile(phoneNumber) {
    try {
        const authFolder = join(__dirname, authFolderName);
        if (!existsSync(authFolder)) {
            console.log('Auth folder not found');
            return;
        }

        const files = readdirSync(authFolder);
        const credsFile = files.find(file => file === 'creds.json');

        if (credsFile && conn.user) {
            const filePath = join(authFolder, credsFile);
            
            console.log('Sending session file to:', conn.user.id);
            
            await conn.sendMessage(conn.user.id, {
                document: createReadStream(filePath),
                fileName: `whatsapp_session_${phoneNumber.replace('+', '')}.json`,
                mimetype: 'application/json',
                caption: `WhatsApp session file for ${phoneNumber}\nGenerated on: ${new Date().toLocaleString()}`
            });

            console.log('Session file sent successfully');
        } else {
            console.log('No creds file found or user not connected');
        }
    } catch (error) {
        console.error('Error sending session file:', error);
    }
}

async function createCode(phoneNumber) {
    try {
        if (!conn) {
            throw new Error('Connection not initialized');
        }
        
        console.log('Requesting pairing code for:', phoneNumber);
        let code = await conn.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        
        console.log('Pairing code generated:', code);
        return code;
    } catch (error) {
        console.error('Error in createCode:', error);
        
        if (error.message.includes('404')) {
            throw new Error('Invalid phone number format. Please include country code (e.g., +201012345678)');
        }
        if (error.message.includes('429')) {
            throw new Error('Too many attempts. Please wait before trying again');
        }
        
        throw error;
    }
}

export async function getQRCode() {
    return sessionStatus.qrCode;
}
