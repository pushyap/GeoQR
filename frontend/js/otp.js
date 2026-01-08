/**
 * GeoQR - Email OTP Verification
 */
document.addEventListener('DOMContentLoaded', () => {

    const tempToken = sessionStorage.getItem('temp_login_token');
    const email = sessionStorage.getItem('login_email');

    if (!tempToken || !email) {
        window.location.href = 'index.html';
        return;
    }

    // Mask email
    document.getElementById('mobileMask').textContent =
        email.replace(/(.{2}).+(@.+)/, '$1****$2');

    document.getElementById('otpForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const otp = document.getElementById('otp').value.trim();

        if (otp.length !== 4) {
            Toast.warning('Enter valid 4-digit OTP');
            return;
        }

        try {
            const res = await API.post('/auth/verify-email-otp', {
                tempToken,
                otp
            });

            if (res.success) {
                Session.save(res.token, res.user);
                sessionStorage.clear();

                Toast.success('OTP verified successfully');

                setTimeout(() => {
                    RoleGuard.redirect();   // ✅ WORKING
                }, 500);
            }

        } catch (err) {
            Toast.error(err.message || 'OTP verification failed');
        }
    });
});
