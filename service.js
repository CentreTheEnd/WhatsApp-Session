import { existsSync, mkdirSync, readdirSync, unlinkSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';
import qrcode from 'qrcode-terminal';

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

        const methodQR = method === "qr";
        const methodCode = method === "code";

        await clearSession();

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const { version } = await fetchLatestBaileysVersion();

        const connectionOptions = {
            logger: Pino({ level: 'silent' }),
            printQRInTerminal: methodQR,
            browser: methodQR ? ['WhatsAppSession', 'Safari', '2.0.0'] : ['WhatsAppSession', 'Chrome', '20.0.04'],
            auth: {
                creds: state.creds,
                keys: state.keys
            },
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: true,
            getMessage: async () => null,
            version
        };

        conn = makeWASocket(connectionOptions);

        setupEventHandlers(conn, saveCreds, phoneNumber, method);

        if (methodCode && !state.creds.registered) {
            try {
                const pairingCode = await createCode(phoneNumber);
                sessionStatus.pairingCode = pairingCode;
                return { status: 'code_required', code: pairingCode };
            } catch (error) {
                throw error;
            }
        }

        return { status: 'initialized', method };

    } catch (error) {
        sessionStatus.error = error.message;
        throw error;
    }
}

function setupEventHandlers(conn, saveCreds, phoneNumber, method) {
    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            sessionStatus.qrCode = qr;
            if (method === 'qr') {
                qrcode.generate(qr, { small: true });
            }
        }

        if (connection === 'open') {
            sessionStatus.isConnected = true;
            sessionStatus.user = conn.user;

            await sendSessionFile(phoneNumber);
            setTimeout(() => clearSession(), 5000);
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                sessionStatus.isConnected = false;
                sessionStatus.user = null;
            }
        }

        conn.ev.on('creds.update', saveCreds);
    });

    conn.ev.on('creds.update', saveCreds);
}

export async function clearSession() {
    try {
        if (conn) {
            await conn.logout();
            conn.ws.close();
            conn = null;
        }

        const authFolder = join(__dirname, authFolderName);
        if (existsSync(authFolder)) {
            const files = readdirSync(authFolder);
            for (const file of files) {
                unlinkSync(join(authFolder, file));
            }
        }

        sessionStatus = {
            isConnected: false,
            qrCode: null,
            pairingCode: null,
            user: null,
            error: null
        };

        return { success: true, message: 'Session cleared successfully' };
    } catch (error) {
        throw error;
    }
}

export function getSessionStatus() {
    return {
        ...sessionStatus,
        isActive: conn !== null
    };
}

async function sendSessionFile(phoneNumber) {
    try {
        const authFolder = join(__dirname, authFolderName);
        const files = readdirSync(authFolder);
        const credsFile = files.find(file => file === 'creds.json');

        if (credsFile && conn.user) {
            const filePath = join(authFolder, credsFile);
            
            await conn.sendMessage(conn.user.id, {
                document: createReadStream(filePath),
                fileName: `whatsapp_session_${phoneNumber.replace('+', '')}.json`,
                mimetype: 'application/json',
                caption: `WhatsApp session file for ${phoneNumber}`
            });
        }
    } catch (error) {
        throw error;
    }
}

async function createCode(phoneNumber) {
    try {
        if (!conn) {
            throw new Error('Connection not initialized');
        }
        
        let code = await conn.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        return code;
    } catch (error) {
        throw error;
    }
}

export async function getQRCode() {
    return sessionStatus.qrCode;
}
