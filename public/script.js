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

        // Update icons when authentication method changes
        document.querySelectorAll('input[name="authMethod"]').forEach(radio => {
            radio.addEventListener('change', () => {
                setTimeout(() => feather.replace(), 10);
            });
        });
    }

    async startAuthentication() {
        const phoneNumber = document.getElementById('phoneNumber').value;
        const authMethod = document.querySelector('input[name="authMethod"]:checked').value;

        // For QR mode, phone number is optional
        let fullPhone = null;
        if (phoneNumber) {
            fullPhone = phoneNumber.replace(/\D/g, '');
            
            // For code mode, phone number is required
            if (authMethod === 'code' && !fullPhone) {
                this.showStatus('Phone number is required for code authentication', 'error');
                return;
            }
        } else if (authMethod === 'code') {
            this.showStatus('Phone number is required for code authentication', 'error');
            return;
        }

        this.showLoading(true);

        try {
            let url = `/session/auth?mode=${authMethod}`;
            if (fullPhone) {
                url += `&phone=${fullPhone}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message);
            }

            this.currentSessionId = data.sessionId;

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
            feather.replace(); // Refresh icons
        }
    }

    showAuthenticationMethod(method, data) {
        document.getElementById('phone-input-section').classList.add('hidden');
        
        if (method === 'qr') {
            document.getElementById('qr-section').classList.remove('hidden');
            if (data.qrCode) {
                document.getElementById('qrCodeImage').src = data.qrCode;
            }
            if (data.instructions) {
                // عرض التعليمات إذا وجدت
                console.log('QR Instructions:', data.instructions);
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
        feather.replace(); // Refresh icons
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
            const response = await fetch(`/session/${this.currentSessionId}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message);
            }

            this.updateStatus(data);

        } catch (error) {
            this.showStatus(`Error checking status: ${error.message}`, 'error');
        } finally {
            feather.replace(); // Refresh icons
        }
    }

    updateStatus(data) {
        const statusElement = document.getElementById('statusMessage');
        
        if (data.authenticated) {
            clearInterval(this.checkInterval);
            statusElement.className = 'status-message success';
            statusElement.innerHTML = '<i data-feather="check-circle"></i> Session connected successfully! Sending session files...';
            
            // Hide other sections
            document.getElementById('qr-section').classList.add('hidden');
            document.getElementById('code-section').classList.add('hidden');
            document.getElementById('status-section').classList.remove('hidden');
            
            // Show session info after a delay
            setTimeout(() => {
                document.getElementById('sessionInfo').classList.remove('hidden');
                statusElement.innerHTML = '<i data-feather="check-circle"></i> Session files have been sent to your WhatsApp! Check your messages.';
                feather.replace(); // Refresh icons
            }, 3000);
            
        } else if (data.qrCode) {
            statusElement.className = 'status-message info';
            statusElement.innerHTML = '<i data-feather="maximize"></i> Waiting for QR code scan...';
            // Update QR code if needed
            if (data.qrCode && document.getElementById('qrCodeImage').src !== data.qrCode) {
                document.getElementById('qrCodeImage').src = data.qrCode;
            }
            
        } else if (data.pairingCode) {
            statusElement.className = 'status-message info';
            statusElement.innerHTML = '<i data-feather="hash"></i> Waiting for code verification...';
            
        } else if (data.sessionExists) {
            statusElement.className = 'status-message info';
            statusElement.innerHTML = '<i data-feather="refresh-cw"></i> Session exists but needs reconnection. Starting new session...';
            // Auto-restart session
            setTimeout(() => this.restartSession(), 2000);
            
        } else {
            statusElement.className = 'status-message info';
            statusElement.innerHTML = `<i data-feather="clock"></i> ${data.message || 'Connecting...'}`;
        }
        
        feather.replace(); // Refresh icons
    }

    async restartSession() {
        const phoneNumber = document.getElementById('phoneNumber').value;
        const authMethod = document.querySelector('input[name="authMethod"]:checked').value;

        try {
            // Clear existing session first
            if (this.currentSessionId) {
                await fetch(`/session/${this.currentSessionId}`, { method: 'DELETE' });
            }
            
            // Start new session
            await this.startAuthentication();
        } catch (error) {
            this.showStatus(`Error restarting session: ${error.message}`, 'error');
        }
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('statusMessage');
        let icon = 'info';
        
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'alert-circle';
        if (type === 'info') icon = 'info';
        
        statusElement.className = `status-message ${type}`;
        statusElement.innerHTML = `<i data-feather="${icon}"></i> ${message}`;
        statusElement.classList.remove('hidden');
        
        feather.replace(); // Refresh icons
    }

    showLoading(show) {
        const button = document.getElementById('startAuth');
        if (show) {
            button.classList.add('loading');
            button.innerHTML = '<i data-feather="loader" class="btn-icon"></i> Connecting...';
        } else {
            button.classList.remove('loading');
            button.innerHTML = '<i data-feather="play" class="btn-icon"></i> Generate Session';
        }
        feather.replace(); // Refresh icons
    }

    resetApp() {
        if (this.currentSessionId) {
            // Clear session from server
            fetch(`/session/${this.currentSessionId}`, {
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
        
        feather.replace(); // Refresh icons
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WhatsAppSessionApp();
});
