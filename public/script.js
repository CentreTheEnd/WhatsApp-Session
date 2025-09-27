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
        
        // Enter key support for phone input
        document.getElementById('phoneNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.startAuthentication();
            }
        });
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

            // If already connected
            if (data.connected) {
                this.showStatus('Session is already connected. Checking file delivery...', 'info');
                this.showAuthenticationMethod('connected', data);
            } else {
                this.showAuthenticationMethod(authMethod, data);
            }

        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showAuthenticationMethod(method, data) {
        document.getElementById('phone-input-section').classList.add('hidden');
        
        if (method === 'qr') {
            document.getElementById('qr-section').classList.remove('hidden');
            if (data.qrCode) {
                document.getElementById('qrCodeImage').src = data.qrCode;
            }
        } else if (method === 'code') {
            document.getElementById('code-section').classList.remove('hidden');
            if (data.pairingCode) {
                document.getElementById('pairingCode').textContent = data.pairingCode;
            }
        } else if (method === 'connected') {
            document.getElementById('status-section').classList.remove('hidden');
            this.showStatus('Session already connected. Files will be sent shortly...', 'info');
        }

        // Start checking status automatically
        this.startStatusChecking();
    }

    startStatusChecking() {
        // Clear existing interval
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        // Check every 3 seconds
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
            
            // Hide other sections
            document.getElementById('qr-section').classList.add('hidden');
            document.getElementById('code-section').classList.add('hidden');
            document.getElementById('status-section').classList.remove('hidden');
            
            // Show session info after a delay
            setTimeout(() => {
                document.getElementById('sessionInfo').classList.remove('hidden');
                statusElement.textContent = '✓ Session files have been sent to your WhatsApp! Check your messages.';
            }, 3000);
            
        } else if (data.qrCode) {
            statusElement.className = 'status-message info';
            statusElement.textContent = 'Waiting for QR code scan...';
            // Update QR code if needed
            if (data.qrCode && data.qrCode !== document.getElementById('qrCodeImage').src) {
                document.getElementById('qrCodeImage').src = data.qrCode;
            }
            
        } else if (data.pairingCode) {
            statusElement.className = 'status-message info';
            statusElement.textContent = 'Waiting for code verification...';
            
        } else if (data.sessionExists) {
            statusElement.className = 'status-message info';
            statusElement.textContent = 'Session exists but needs reconnection. Starting new session...';
            // Auto-restart session
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
            // Clear existing session first
            await fetch(`/session/${fullPhone}`, { method: 'DELETE' });
            
            // Start new session
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
            button.classList.add('loading');
            button.textContent = 'Connecting...';
        } else {
            button.classList.remove('loading');
            button.textContent = 'Generate Session';
        }
    }

    resetApp() {
        if (this.currentSessionId) {
            // Clear session from server
            fetch(`/session/${this.currentSessionId.replace('session_', '')}`, {
                method: 'DELETE'
            }).catch(error => console.error('Error clearing session:', error));
        }

        clearInterval(this.checkInterval);
        this.currentSessionId = null;

        // Reset UI
        document.querySelectorAll('.qr-section, .code-section, .status-section')
                .forEach(el => el.classList.add('hidden'));
        document.getElementById('phone-input-section').classList.remove('hidden');
        document.getElementById('phoneNumber').value = '';
        document.getElementById('statusMessage').classList.add('hidden');
        document.getElementById('sessionInfo').classList.add('hidden');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentContentLoaded', () => {
    new WhatsAppSessionApp();
});
