import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import Pino from 'pino';
import {Boom} from '@hapi/boom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


let authFolderName = "sessions";
let conn = null;


export function verificationAuthFolder() {
  const authFolder = join(__dirname, authFolderName);
  if (!existsSync(authPath)) {
    mkdirSync(authPath, { recursive: true });
  }
};


export async function createSession(phoneNumber, method = 'code') {
  verificationAuthFolder();
  const authFolder = join(__dirname, authFolderName);

  const methodQR = method === "qr";
  const methodCode = method === "code";

  const {state, saveCreds} = await useMultiFileAuthState(authFolder);
  const {version} = await fetchLatestBaileysVersion();

  const connectionOptions = {
    logger: Pino({ level: 'silent' }),
    printQRInTerminal: methodQR,
    browser: methodQR ? ['WhatsAppSession', 'Safari', '2.0.0'] : ['WhatsAppSession', 'Chrome', '20.0.04'],
    auth: {
        creds: state.creds,
        keys: state.keys
    },
    waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat?ED=CAIICA',
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
        return null;
    }
  };

  conn = makeWASocket(connectionOptions);
  
};

export async function clearSession() {
};

export async function senderScokt() {
};

async function createQr() {
};

async function createCode(phoneNumber) {
  let code = await conn.requestPairingCode(phoneNumber);
  code = code?.match(/.{1,4}/g)?.join("-") || code;
  return code;
};

