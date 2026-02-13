/**
 * Faculty QR Logic
 * Handles dynamic QR generation and rotation for live attendance
 */

let qrRefreshInterval = null;
let currentQRSessionId = null;

// Initialize QR Code instance
let qrCodeObj = null;

async function startLiveQR(sessionId) {
    try {
        // 1. Start QR Session
        const token = sessionStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/api/faculty/qr/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                // If sessionId is passed, it uses existing. If not, logic in backend handles new/resume.
                // But here we likely already created a session via standard API or treating this as the start.
                // If sessionId is from createSession(), we pass it? 
                // The backend /start endpoint logic: if body has location_id, creates new. If has nothing, resumes active?
                // Let's assume we pass session_id if available to link it? 
                // Actually backend /start checks "is_active=true" for faculty. 
                // If we JUST created a session, it IS active. 
                // So calling /qr/start will resume it and generate token.
            })
        });

        const data = await response.json();

        if (!data.success) {
            alert('Failed to start Live QR: ' + (data.error || 'Unknown error'));
            return;
        }

        currentQRSessionId = data.qr_session_id;

        // 2. Show Modal with QR
        document.getElementById('liveAttendanceModal').style.display = 'block';
        // Add QR container if not exists
        let qrContainer = document.getElementById('liveQRCode');
        if (!qrContainer) {
            qrContainer = document.createElement('div');
            qrContainer.id = 'liveQRCode';
            qrContainer.style.margin = '20px auto';
            qrContainer.style.display = 'flex';
            qrContainer.style.justifyContent = 'center';
            // Insert before the count
            const modalBody = document.querySelector('#liveAttendanceModal .modal-body');
            modalBody.insertBefore(qrContainer, modalBody.firstChild);
        }
        qrContainer.innerHTML = ''; // Clear previous

        // 3. Render Initial QR
        renderQR(qrContainer, data.qr_session_id, data.qr_token);

        // 4. Start Refresh Loop (10s)
        if (qrRefreshInterval) clearInterval(qrRefreshInterval);
        qrRefreshInterval = setInterval(() => refreshQR(data.qr_session_id), 10000);

        // Update UI status
        document.getElementById('liveSessionName').textContent = 'Live Session';

    } catch (error) {
        console.error('Start Live QR Error:', error);
        alert('Failed to connect to server');
    }
}

async function refreshQR(sessionId) {
    try {
        const token = sessionStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/api/faculty/qr/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ qr_session_id: sessionId })
        });

        const data = await response.json();
        if (data.success) {
            const qrContainer = document.getElementById('liveQRCode');
            if (qrContainer) {
                renderQR(qrContainer, sessionId, data.qr_token);
                // Optional: Flash effect to show update
                qrContainer.style.opacity = '0.5';
                setTimeout(() => qrContainer.style.opacity = '1', 200);
            }
        }
    } catch (error) {
        console.error('Refresh QR Error:', error);
    }
}

let qrCodeInstance = null;

function renderQR(container, sessionId, token) {
    // QR Data
    const qrData = JSON.stringify({
        sid: sessionId,
        t: token
    });

    if (!qrCodeInstance) {
        // Create new
        container.innerHTML = '';
        qrCodeInstance = new QRCode(container, {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Add debug token display
        const debugDiv = document.createElement('div');
        debugDiv.id = 'debugTokenDisplay';
        debugDiv.style.marginTop = '10px';
        debugDiv.style.fontSize = '12px';
        debugDiv.style.color = '#666';
        debugDiv.style.wordBreak = 'break-all';
        debugDiv.textContent = `Token: ${token.substring(0, 10)}... (Session: ${sessionId})`;
        container.appendChild(debugDiv);

    } else {
        // Update existing
        qrCodeInstance.clear();
        qrCodeInstance.makeCode(qrData);

        // Update debug text
        const debugDiv = document.getElementById('debugTokenDisplay');
        if (debugDiv) {
            debugDiv.textContent = `Token: ${token.substring(0, 10)}... (Session: ${sessionId})`;
        }
    }

    console.log("Rendered QR:", qrData);
}

async function stopLiveQR() {
    if (qrRefreshInterval) clearInterval(qrRefreshInterval);

    if (currentQRSessionId) {
        try {
            const token = sessionStorage.getItem('authToken');
            await fetch(`${API_BASE_URL}/api/faculty/qr/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ qr_session_id: currentQRSessionId })
            });
        } catch (e) { console.error(e); }
    }

    document.getElementById('liveAttendanceModal').style.display = 'none';
    currentQRSessionId = null;
    window.location.reload(); // Reload to refresh list/status
}

// Attach to button (if present) or call programmatically
// We'll expose this globally
window.startLiveQR = startLiveQR;
window.stopLiveQR = stopLiveQR;
