document.addEventListener('DOMContentLoaded', () => {
    const tempToken = sessionStorage.getItem('temp_login_token');
    const maskedMobile = sessionStorage.getItem('masked_mobile');

    if (!tempToken) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('mobileMask').textContent = maskedMobile;

    document.getElementById('otpForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const otp = document.getElementById('otp').value.trim();

        if (otp.length !== 4) {
            Toast.warning('Invalid OTP');
            return;
        }

        try {
            const response = await API.post('/auth/verify-otp', {
                tempToken,
                otp
            });

            if (response.success) {
                sessionStorage.clear();
                Session.save(response.token, response.user);
                Toast.success('OTP Verified');

                setTimeout(() => RoleGuard.redirectToDashboard(), 800);
            }
        } catch (err) {
            Toast.error(err.message || 'OTP verification failed');
        }
    });
});
