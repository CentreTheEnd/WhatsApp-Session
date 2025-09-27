import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sessionService from './sessionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// API Routes
app.use('/session', sessionService);

// Serve frontend for root route
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

app.use((error, req, res, next) => {
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}`);
    console.log(`API available at http://localhost:${PORT}/session`);
});

export default app;
