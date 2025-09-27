class SessionManager {
    constructor() {
        this.sessionForm = document.getElementById('sessionForm');
        this.statusContainer = document.getElementById('status');
        this.statusMessage = document.getElementById('statusMessage');
        this.qrCodeContainer = document.getElementById('qrCode');
        this.pairingCodeContainer = document.getElementById('pairingCode');
        this.createBtn = document.getElementById('createBtn');
        
        this.currentPhone = null;
        this.statusInterval = null;
        
        this.init();
    }

    init() {
        this.sessionForm.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const phone = document.getElementById('phone').value.trim();
        const method = document.getElementById('method').value;

        if (!this.validatePhone(phone)) {
            this.showStatus('Please enter a valid phone number with country code (e.g., +1234567890)', 'error');
            return;
        }

        this.currentPhone = phone;
        this.createBtn.disabled = true;
        this.createBtn.textContent = 'Creating Session...';
        this.hideStatus();

        try {
            const response = await fetch(`/api/session/create?phone=${encodeURIComponent(phone)}&method=${method}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Unknown error occurred');
            }

            this.showStatus('Session creation started. Checking status...', 'info');
            this.monitorSessionStatus(phone);
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
            this.resetForm();
        }
    }

    async monitorSessionStatus(phone) {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }

        this.statusInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/session/status/${encodeURIComponent(phone)}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Status check failed');
                }

                this.updateStatusDisplay(data);

                if (data.status === 'connected') {
                    this.showStatus('Session created successfully! Session file has been sent to your WhatsApp.', 'success');
                    this.stopMonitoring();
                    setTimeout(() => this.resetForm(), 5000);
                    return;
                }

                if (data.status === 'error' || data.status === 'disconnected') {
                    this.showStatus(`Session creation failed: ${data.error || 'Unknown error'}`, 'error');
                    this.stopMonitoring();
                    this.resetForm();
                    return;
                }

                // Show progress for long-running sessions
                if (data.status === 'initializing' || data.status === 'qr_generated' || data.status === 'code_generated') {
                    this.showStatus(`Status: ${data.status}. Please check your WhatsApp...`, 'info');
                }

            } catch (error) {
                console.error('Status check error:', error);
                // Don't show error for temporary network issues
            }
        }, 2000);
    }

    stopMonitoring() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    updateStatusDisplay(data) {
        if (data.qrCode) {
            this.qrCodeContainer.innerHTML = `<img src="${data.qrCode}" alt="QR Code" style="max-width: 200px;">`;
            this.qrCodeContainer.classList.remove('hidden');
        } else {
            this.qrCodeContainer.classList.add('hidden');
        }

        if (data.pairingCode) {
            this.pairingCodeContainer.innerHTML = `
                <p>Pairing Code: <strong style="font-size: 1.2em;">${data.pairingCode}</strong></p>
                <p>Enter this code in WhatsApp > Linked Devices > Link a Device</p>
            `;
            this.pairingCodeContainer.classList.remove('hidden');
        } else {
            this.pairingCodeContainer.classList.add('hidden');
        }
    }

    validatePhone(phone) {
        return /^\+[1-9]\d{1,14}$/.test(phone);
    }

    showStatus(message, type) {
        this.statusContainer.classList.remove('hidden');
        this.statusMessage.textContent = message;
        this.statusMessage.className = type;
    }

    hideStatus() {
        this.statusContainer.classList.add('hidden');
        this.qrCodeContainer.classList.add('hidden');
        this.pairingCodeContainer.classList.add('hidden');
    }

    resetForm() {
        this.createBtn.disabled = false;
        this.createBtn.textContent = 'Create Session';
        this.currentPhone = null;
        this.stopMonitoring();
    }

    // Cleanup when page is unloaded
    destroy() {
        this.stopMonitoring();
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.sessionManager = new SessionManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.sessionManager) {
        window.sessionManager.destroy();
    }
});
