class WhatsAppSessionApp {
    constructor() {
        this.currentSessionId = null;
        this.checkInterval = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('startAuth').addEventListener('click', () => this.startAuthentication());
        document.getElementById('checkStatus').addEventListener('click', () => this.checkStatus());
        document.getElementById('checkStatusCode').addEventListener('click', () => this.checkStatus());
        document.getElementById('newSession').addEventListener('click', () => this.resetApp());
        document.getElementById('cancelQr').addEventListener('click', () => this.resetApp());
        document.getElementById('cancelCode').addEventListener('click', () => this.resetApp());
        
        document.getElementById('phoneNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.startAuthentication();
            }
        });

        document.querySelectorAll('input[name="authMethod"]').forEach(radio => {
            radio.addEventListener('change', () => this.updateAuthMethod());
        });
    }

    updateAuthMethod() {
        const method = document.querySelector('input[name="authMethod"]:checked').value;
        const button = document.getElementById('startAuth');
        
        if (method === 'qr') {
            button.textContent = 'Generate QR Code';
        } else {
            button.textContent = 'Get Pairing Code';
        }
    }

    async startAuthentication() {
        const phoneNumber = document.getElementById('phoneNumber').value;
        const countryCode = document.getElementById('countryCode').value;
        const authMethod = document.querySelector('input[name="authMethod"]:checked').value;

        if (!phoneNumber) {
            this.showStatus('Please enter a phone number', 'error');
            return;
        }

        const fullPhone = countryCode + phoneNumber.replace(/\D/g, '');
        
        this.showLoading(true);
        this.currentSessionId = `session_${fullPhone}`;

        try {
            const response = await fetch(`/session/auth?phone=${fullPhone}&mode=${authMethod}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message);
            }

            if (data.connected) {
                this.showStatus('Session is already connected. Checking file delivery...', 'info');
                this.showSection('status-section');
                this.startStatusChecking();
            } else {
                this.showAuthenticationMethod(authMethod, data);
            }

        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
            this.showLoading(false);
        }
    }

    showAuthenticationMethod(method, data) {
        this.showSection('phone-input-section', false);
        
        if (method === 'qr') {
            this.showSection('qr-section');
            if (data.qrCode) {
                document.getElementById('qrCodeImage').src = data.qrCode;
            }
            this.showStatus('QR code generated. Scan it with WhatsApp.', 'info');
        } else {
            this.showSection('code-section');
            if (data.pairingCode) {
                document.getElementById('pairingCode').textContent = data.pairingCode;
            }
            this.showStatus('Pairing code generated. Enter it in WhatsApp.', 'info');
        }

        this.startStatusChecking();
        this.showLoading(false);
    }

    showSection(sectionId, showStatus = true) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionId).classList.add('active');
        
        if (showStatus) {
            document.getElementById('statusMessage').classList.remove('hidden');
        }
    }

    startStatusChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(() => this.checkStatus(), 3000);
    }

    async checkStatus() {
        if (!this.currentSessionId) return;

        try {
            const phone = this.currentSessionId.replace('session_', '');
            const response = await fetch(`/session/${phone}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message);
            }

            this.updateStatus(data);

        } catch (error) {
            this.showStatus(`Error checking status: ${error.message}`, 'error');
        }
    }

    updateStatus(data) {
        const statusElement = document.getElementById('statusMessage');
        
        if (data.authenticated) {
            clearInterval(this.checkInterval);
            statusElement.className = 'status-message success';
            statusElement.textContent = '✓ Session connected successfully! Sending session files...';
            
            this.showSection('status-section');
            
            setTimeout(() => {
                statusElement.textContent = '✓ Session files have been sent to your WhatsApp! Check your messages.';
                document.getElementById('sessionInfo').classList.remove('hidden');
            }, 3000);
            
        } else if (data.qrCode) {
            statusElement.className = 'status-message info';
            statusElement.textContent = 'Waiting for QR code scan...';
            if (data.qrCode && data.qrCode !== document.getElementById('qrCodeImage').src) {
                document.getElementById('qrCodeImage').src = data.qrCode;
            }
            
        } else if (data.pairingCode) {
            statusElement.className = 'status-message info';
            statusElement.textContent = 'Waiting for code verification...';
            
        } else if (data.sessionExists) {
            statusElement.className = 'status-message warning';
            statusElement.textContent = 'Session exists but needs reconnection. Starting new session...';
            setTimeout(() => this.restartSession(), 2000);
            
        } else {
            statusElement.className = 'status-message info';
            statusElement.textContent = data.message || 'Connecting...';
        }
    }

    async restartSession() {
        const phoneNumber = document.getElementById('phoneNumber').value;
        const countryCode = document.getElementById('countryCode').value;
        const authMethod = document.querySelector('input[name="authMethod"]:checked').value;
        const fullPhone = countryCode + phoneNumber.replace(/\D/g, '');

        try {
            await fetch(`/session/${fullPhone}`, { method: 'DELETE' });
            await this.startAuthentication();
        } catch (error) {
            this.showStatus(`Error restarting session: ${error.message}`, 'error');
        }
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('statusMessage');
        statusElement.className = `status-message ${type}`;
        statusElement.textContent = message;
        statusElement.classList.remove('hidden');
    }

    showLoading(show) {
        const button = document.getElementById('startAuth');
        if (show) {
            button.disabled = true;
            button.classList.add('loading');
            button.textContent = 'Connecting...';
        } else {
            button.disabled = false;
            button.classList.remove('loading');
            this.updateAuthMethod();
        }
    }

    resetApp() {
        if (this.currentSessionId) {
            fetch(`/session/${this.currentSessionId.replace('session_', '')}`, {
                method: 'DELETE'
            }).catch(error => console.error('Error clearing session:', error));
        }

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.currentSessionId = null;
        this.showSection('phone-input-section');
        document.getElementById('phoneNumber').value = '';
        document.getElementById('statusMessage').classList.add('hidden');
        document.getElementById('sessionInfo').classList.add('hidden');
        this.showLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppSessionApp();
});
