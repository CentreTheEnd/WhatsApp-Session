import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const deleteSessionFiles = async (phone) => {
    try {
        const sessionPath = path.join(__dirname, '../sessions', `${phone}.json`);
        
        if (fs.existsSync(sessionPath)) {
            fs.unlinkSync(sessionPath);
            console.log(`Session files deleted for ${phone}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error deleting session files:', error);
        return false;
    }
};

export const cleanupOldSessions = async () => {
    try {
        const sessionsDir = path.join(__dirname, '../sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
            return;
        }

        const files = fs.readdirSync(sessionsDir);
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        let deletedCount = 0;
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(sessionsDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > oneHour) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                    console.log(`Deleted old session file: ${file}`);
                }
            }
        }

        console.log(`Cleanup completed: ${deletedCount} old sessions deleted`);
        return deletedCount;
    } catch (error) {
        console.error('Error cleaning up old sessions:', error);
        return 0;
    }
};

// Cleanup old sessions every hour
setInterval(cleanupOldSessions, 60 * 60 * 1000);

// Initial cleanup on startup
cleanupOldSessions().then(count => {
    console.log(`Initial cleanup: ${count} old sessions removed`);
});
