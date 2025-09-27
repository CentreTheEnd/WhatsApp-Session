class WhatsAppSessionManager {
    constructor() {
        this.baseUrl = window.location.origin;
        this.currentSession = null;
        this.statusInterval = null;
        
        this.initializeEventListeners();
        this.checkExistingSession();
    }

    initializeEventListeners() {
        document.getElementById('createSessionBtn').addEventListener('click', () => this.createSession());
        document.getElementById('clearSessionBtn').addEventListener('click', () => this.clearSession());
        document.getElementById('refreshQrBtn').addEventListener('click', () => this.refreshQrCode());
    }

    async createSession() {
        const phoneNumber = document.getElementById('phoneNumber').value.trim();
        const method = document.querySelector('input[name="method"]:checked').value;

        if (!this.validatePhoneNumber(phoneNumber)) {
            this.showNotification('Please enter a valid phone number with country code', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`${this.baseUrl}/session/create?number=${encodeURIComponent(phoneNumber)}&method=${method}`);
            const data = await response.json();

            if (data.success) {
                this.currentSession = { phoneNumber, method };
                this.showNotification('Session created successfully', 'success');
                this.showSessionStatus();
                this.startStatusMonitoring();
                
                if (method === 'qr') {
                    this.showQrSection();
                } else if (method === 'code' && data.code) {
                    this.showCodeSection(data.code);
                }
            } else {
                throw new Error(data.error || 'Failed to create session');
            }
        } catch (error) {
            this.showNotification(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async clearSession() {
        this.showLoading(true);

        try {
            const response = await fetch(`${this.baseUrl}/session/clear`, { method: 'DELETE' });
            const data = await response.json();

            if (data.success) {
                this.showNotification('Session cleared successfully', 'success');
                this.resetUI();
                this.stopStatusMonitoring();
                this.currentSession = null;
            } else {
                throw new Error(data.error || 'Failed to clear session');
            }
        } catch (error) {
            this.showNotification(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async refreshQrCode() {
        if (!this.currentSession) return;

        try {
            const response = await fetch(`${this.baseUrl}/session/qr-image`);
            if (response.ok) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);
                document.getElementById('qrImage').src = imageUrl;
                this.showNotification('QR code refreshed', 'success');
            }
        } catch (error) {
            this.showNotification('Failed to refresh QR code', 'error');
        }
    }

    async checkExistingSession() {
        try {
            const response = await fetch(`${this.baseUrl}/session/status`);
            const data = await response.json();

            if (data.success && data.isActive) {
                this.showSessionStatus();
                this.startStatusMonitoring();
            }
        } catch (error) {
            console.log('No active session found');
        }
    }

    async showSessionStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/session/status`);
            const data = await response.json();

            if (data.success) {
                this.updateStatusDisplay(data);
            }
        } catch (error) {
            console.error('Failed to get session status:', error);
        }
    }

    updateStatusDisplay(status) {
        const statusContent = document.getElementById('statusContent');
        
        let html = `
            <div class="status-item">
                <strong>Connection Status:</strong> 
                <span class="${status.isConnected ? 'connected' : 'disconnected'}">
                    ${status.isConnected ? 'Connected' : 'Disconnected'}
                </span>
            </div>
            <div class="status-item">
                <strong>User:</strong> ${status.user ? status.user.id : 'Not connected'}
            </div>
            <div class="status-item">
                <strong>QR Available:</strong> ${status.qrCode ? 'Yes' : 'No'}
            </div>
            <div class="status-item">
                <strong>Last Update:</strong> ${new Date().toLocaleString()}
            </div>
        `;

        statusContent.innerHTML = html;
        document.getElementById('statusSection').classList.remove('hidden');
    }

    showQrSection() {
        document.getElementById('qrSection').classList.remove('hidden');
        document.getElementById('codeSection').classList.add('hidden');
        this.refreshQrCode();
    }

    showCodeSection(code) {
        document.getElementById('pairingCode').textContent = code;
        document.getElementById('codeSection').classList.remove('hidden');
        document.getElementById('qrSection').classList.add('hidden');
    }

    startStatusMonitoring() {
        this.stopStatusMonitoring();
        this.statusInterval = setInterval(() => {
            this.showSessionStatus();
        }, 5000);
    }

    stopStatusMonitoring() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    resetUI() {
        document.getElementById('statusSection').classList.add('hidden');
        document.getElementById('qrSection').classList.add('hidden');
        document.getElementById('codeSection').classList.add('hidden');
        document.getElementById('phoneNumber').value = '';
    }

    validatePhoneNumber(phone) {
        return /^\+\d{10,15}$/.test(phone);
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        const button = document.getElementById('createSessionBtn');
        
        if (show) {
            overlay.classList.remove('hidden');
            button.disabled = true;
            button.textContent = 'Creating Session...';
        } else {
            overlay.classList.add('hidden');
            button.disabled = false;
            button.textContent = 'Create Session';
        }
    }

    showNotification(message, type) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.classList.add('hidden'), 300);
        }, 3000);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppSessionManager();
});
