import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch, mkdirSync, writeFileSync } from 'fs';
import path, { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode';
import pino from 'pino';
import { Boom } from '@hapi/boom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, 
      makeCacheableSignalKeyStore, PHONENUMBER_MCC } = await import('@whiskeysockets/baileys');
const {
	default: _makeWaSocket,
	makeWALegacySocket,
	proto,
	downloadContentFromMessage,
	jidDecode,
	areJidsSameUser,
	generateWAMessage,
	generateForwardMessageContent,
	generateWAMessageFromContent,
	WAMessageStubType,
	extractMessageContent,
	makeInMemoryStore,
	getAggregateVotesInPollMessage,
	prepareWAMessageMedia,
	WA_DEFAULT_EPHEMERAL
} = (await import("@whiskeysockets/baileys")).default

const sessionFolder = "tmp";
const sessions = new Map();

class WhatsAppSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.conn = null;
    this.qrCode = null;
    this.pairingCode = null;
    this.status = 'disconnected';
    this.isConnected = false;
    this.userJid = null;
  }

  async initialize(mode = 'qr') {
    const authPath = join(__dirname, sessionFolder, this.sessionId);
    
    if (!existsSync(authPath)) {
      mkdirSync(authPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const { version, isLatest } = await fetchLatestBaileysVersion();

    const connectionOptions = {
      logger: pino({ level: 'silent' }),
      printQRInTerminal: mode === 'qr',
      mobile: false,
      browser: mode === 'qr' ? ['TheEnd-MD', 'Safari', '2.0.0'] : ['Ubuntu', 'Chrome', '20.0.04'],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
      },
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      getMessage: async (key) => {
        return null;
      },
      version,
    };

    this.conn = _makeWaSocket(connectionOptions);
    
    this.conn.ev.on('connection.update', (update) => this.handleConnectionUpdate(update));
    this.conn.ev.on('creds.update', saveCreds);

    return this.conn;
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    if (qr) {
      this.qrCode = qr;
      this.status = 'qr_ready';
    }

    if (connection === 'open') {
      this.status = 'connected';
      this.isConnected = true;
      this.userJid = this.conn.user.id;
      console.log(`Session ${this.sessionId} connected successfully`);
      
      // Send session files after successful connection
      await this.sendSessionFiles();
    }

    if (connection === 'close') {
      this.status = 'disconnected';
      this.isConnected = false;
      
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`Connection closed for ${this.sessionId}, reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        await this.clearSessionFiles();
      }
    }
  }

  async getPairingCode(phone) {
    if (!this.conn) return null;
    
    try {
      const code = await this.conn.requestPairingCode(phone.replace(/[^0-9]/g, ''));
      this.pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
      return this.pairingCode;
    } catch (error) {
      throw new Error(`Failed to get pairing code: ${error.message}`);
    }
  }

  async sendSessionFiles() {
    if (!this.isConnected || !this.userJid) {
      console.log('Cannot send session files: Not connected or user JID not available');
      return;
    }

    try {
      const sessionPath = join(__dirname, sessionFolder, this.sessionId);
      
      if (!existsSync(sessionPath)) {
        console.log('Session path does not exist:', sessionPath);
        return;
      }

      // Read creds.json file
      const credsPath = join(sessionPath, 'creds.json');
      if (!existsSync(credsPath)) {
        console.log('creds.json file not found');
        return;
      }

      const credsContent = readFileSync(credsPath, 'utf8');
      
      // Create a Buffer from the creds content
      const credsBuffer = Buffer.from(credsContent, 'utf8');
      
      // Send creds.json as a file message
      await this.conn.sendMessage(this.userJid, {
        document: credsBuffer,
        fileName: `whatsapp-session-${this.sessionId}-creds.json`,
        mimetype: 'application/json',
        caption: `WhatsApp Session Credentials for ${this.sessionId}\n\nThis file contains your session authentication data. Keep it secure!`
      });

      console.log(`Session credentials sent successfully to ${this.userJid}`);

      // Also send other session files if they exist
      const otherFiles = readdirSync(sessionPath).filter(file => 
        file.endsWith('.json') && file !== 'creds.json'
      );

      for (const file of otherFiles) {
        const filePath = join(sessionPath, file);
        const fileContent = readFileSync(filePath, 'utf8');
        const fileBuffer = Buffer.from(fileContent, 'utf8');
        
        await this.conn.sendMessage(this.userJid, {
          document: fileBuffer,
          fileName: `whatsapp-session-${this.sessionId}-${file}`,
          mimetype: 'application/json',
          caption: `Session file: ${file}`
        });

        console.log(`Session file ${file} sent successfully`);
      }

      // Send completion message
      await this.conn.sendMessage(this.userJid, {
        text: `Session setup completed successfully!\n\nAll session files have been sent. You can now use these files to authenticate in other WhatsApp clients.\n\nSession ID: ${this.sessionId}\n\n⚠️ Important: Keep these files secure and do not share them with anyone!`
      });

      console.log('All session files sent successfully');

      // Cleanup after sending (wait 10 seconds to ensure messages are delivered)
      setTimeout(() => this.cleanup(), 10000);
      
    } catch (error) {
      console.error('Error sending session files:', error);
      
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
    }
  }

  async clearSessionFiles() {
    try {
      const sessionPath = join(__dirname, sessionFolder, this.sessionId);
      if (existsSync(sessionPath)) {
        readdirSync(sessionPath).forEach(file => {
          unlinkSync(join(sessionPath, file));
        });
        // Remove the directory itself
        try {
          unlinkSync(sessionPath);
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
      userJid: this.userJid
    };
  }
}

async function authSession(phone, method = 'qr') {
  let phoneNumber = phone.replace(/[^0-9]/g, '');
  
  // Validate phone number
  const validPrefixes = Object.keys(PHONENUMBER_MCC || {});
  if (validPrefixes.length > 0 && !validPrefixes.some(v => phoneNumber.startsWith(v))) {
    throw new Error('Invalid phone number format');
  }

  const sessionId = `session_${phoneNumber}`;
  
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
    
    return status;
  }

  // Create new session
  const session = new WhatsAppSession(sessionId);
  sessions.set(sessionId, session);

  await session.initialize(method);

  if (method === 'code') {
    const pairingCode = await session.getPairingCode(phoneNumber);
    return {
      sessionId,
      pairingCode,
      message: 'Use this code to pair your device'
    };
  }

  // Generate QR code for QR method
  let qrImage = null;
  if (session.qrCode) {
    qrImage = await qrcode.toDataURL(session.qrCode);
  }

  return {
    sessionId,
    qrCode: qrImage,
    message: 'Scan the QR code with WhatsApp'
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
      userJid: status.userJid
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
    if (existsSync(sessionPath)) {
      readdirSync(sessionPath).forEach(file => {
        unlinkSync(join(sessionPath, file));
      });
      console.log(`Session files cleared for ${sessionId}`);
    }
  }
}

export { authSession, verifySession, clearSession };
