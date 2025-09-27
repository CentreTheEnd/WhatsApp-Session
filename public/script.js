class SessionManager {
    constructor() {
        this.sessionForm = document.getElementById('sessionForm');
        this.statusContainer = document.getElementById('status');
        this.statusMessage = document.getElementById('statusMessage');
        this.qrCodeContainer = document.getElementById('qrCode');
        this.pairingCodeContainer = document.getElementById('pairingCode');
        this.createBtn = document.getElementById('createBtn');
        
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
            this.showStatus('Please enter a valid phone number with country code', 'error');
            return;
        }

        this.createBtn.disabled = true;
        this.createBtn.textContent = 'Creating Session...';
        this.hideStatus();

        try {
            const response = await fetch(`/api/session/create?phone=${encodeURIComponent(phone)}&method=${method}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            this.showStatus('Session creation started. Checking status...', 'info');
            this.monitorSessionStatus(phone);
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
            this.createBtn.disabled = false;
            this.createBtn.textContent = 'Create Session';
        }
    }

    async monitorSessionStatus(phone) {
        const checkStatus = async () => {
            try {
                const response = await fetch(`/api/session/status/${encodeURIComponent(phone)}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error);
                }

                this.updateStatusDisplay(data);

                if (data.status === 'connected') {
                    this.showStatus('Session created successfully! Session file has been sent to your WhatsApp.', 'success');
                    this.createBtn.disabled = false;
                    this.createBtn.textContent = 'Create Session';
                    return;
                }

                if (data.status === 'error' || data.status === 'disconnected') {
                    this.showStatus('Session creation failed. Please try again.', 'error');
                    this.createBtn.disabled = false;
                    this.createBtn.textContent = 'Create Session';
                    return;
                }

                // Continue monitoring
                setTimeout(checkStatus, 2000);
            } catch (error) {
                this.showStatus(`Error checking status: ${error.message}`, 'error');
                this.createBtn.disabled = false;
                this.createBtn.textContent = 'Create Session';
            }
        };

        checkStatus();
    }

    updateStatusDisplay(data) {
        this.showStatus(`Status: ${data.status}`, 'info');

        if (data.qrCode) {
            this.qrCodeContainer.innerHTML = `<img src="${data.qrCode}" alt="QR Code">`;
            this.qrCodeContainer.classList.remove('hidden');
        } else {
            this.qrCodeContainer.classList.add('hidden');
        }

        if (data.pairingCode) {
            this.pairingCodeContainer.innerHTML = `<p>Pairing Code: <strong>${data.pairingCode}</strong></p>`;
            this.pairingCodeContainer.classList.remove('hidden');
        } else {
            this.pairingCodeContainer.classList.add('hidden');
        }
    }

    validatePhone(phone) {
        return /^\+\d{10,15}$/.test(phone);
    }

    showStatus(message, type) {
        this.statusContainer.classList.remove('hidden');
        this.statusMessage.textContent = message;
        this.statusMessage.className = type;
    }

    hideStatus() {
        this.statusContainer.classList.add('hidden');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new SessionManager();
});
