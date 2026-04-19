import { getRecord, saveRecord, hashPassword, getAllRecords } from "../db.js";
import { showToast } from "../ui.js";

export const renderLoginView = (container) => {
    // Hide sidebar and topbar
    const sidebar = document.getElementById("sidebar");
    const topbar = document.querySelector(".topbar");
    if (sidebar) sidebar.style.display = "none";
    if (topbar) topbar.style.display = "none";
    
    // Check if currently locked out
    const lockUntil = localStorage.getItem("login_lock_until");
    if (lockUntil && Date.now() < parseInt(lockUntil, 10)) {
        const remainingMinutes = Math.ceil((parseInt(lockUntil, 10) - Date.now()) / 60000);
        showToast(`Login locked. Try again in ${remainingMinutes} minutes.`, "error");
    }

    container.innerHTML = `
        <div class="login-wrapper" style="display: flex; height: 100vh; align-items: center; justify-content: center; background: var(--bg-secondary); margin: -20px; padding: 20px;">
            <div class="login-container" style="width: 100%; max-width: 400px; padding: 40px 30px; background: var(--bg-primary); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); text-align: center;">
                <i class="ph ph-lock-key" style="font-size: 56px; color: var(--primary-color); margin-bottom: 20px;"></i>
                <h2 style="margin-bottom: 30px; color: var(--text-primary); font-size: 24px;">Acu Shafi Clinic Software</h2>
                
                <form id="loginForm" style="display: flex; flex-direction: column; gap: 20px; text-align: left;">
                    <div class="form-group">
                        <label style="display: block; margin-bottom: 8px; color: var(--text-secondary); font-weight: 500;">Doctor ID</label>
                        <input type="text" id="doctorId" class="form-input" required autocomplete="username" placeholder="Enter Doctor ID" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 16px;">
                    </div>
                    
                    <div class="form-group">
                        <label style="display: block; margin-bottom: 8px; color: var(--text-secondary); font-weight: 500;">Password</label>
                        <input type="password" id="password" class="form-input" required autocomplete="current-password" placeholder="Enter Password" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 16px;">
                    </div>
                    
                    <button type="submit" class="primary-btn pulse-glow" style="width: 100%; padding: 14px; font-size: 16px; margin-top: 10px; display: flex; justify-content: center; align-items: center; gap: 8px; font-weight: 600;">
                        <i class="ph ph-sign-in"></i> Login
                    </button>
                    <div style="text-align: center; margin-top: 5px;">
                        <a href="#" id="forgotPasswordBtn" style="color: var(--primary-color); text-decoration: none; font-size: 14px; font-weight: 500;">Forgot Password?</a>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Because container is inside 'main-content', we want to remove the default padding of router-view for login
    container.style.padding = "0";

    const handleFailedAttempt = () => {
        let attempts = parseInt(localStorage.getItem("login_attempts") || "0", 10);
        attempts++;
        localStorage.setItem("login_attempts", attempts.toString());
        
        if (attempts >= 5) {
            // Lock for 5 minutes
            const unlockTime = Date.now() + 5 * 60 * 1000;
            localStorage.setItem("login_lock_until", unlockTime.toString());
            showToast("5 failed attempts. Login locked for 5 minutes.", "error");
        } else {
            showToast("Invalid doctor ID or password.", "error");
        }
    };

    document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        // Re-check lock
        const currentLockUntil = localStorage.getItem("login_lock_until");
        if (currentLockUntil && Date.now() < parseInt(currentLockUntil, 10)) {
            const remainingMinutes = Math.ceil((parseInt(currentLockUntil, 10) - Date.now()) / 60000);
            showToast(`Login locked. Try again in ${remainingMinutes} minutes.`, "error");
            return;
        }

        const doctorId = document.getElementById("doctorId").value.trim();
        const password = document.getElementById("password").value;

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Verifying...';
        submitBtn.disabled = true;

        try {
            // Updated network fix using dynamic base URL as requested
            const response = await fetch(`${window.location.origin}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: doctorId, password: password })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    // Set session securely natively
                    localStorage.setItem("session_active", "true");
                    localStorage.setItem("session_user", data.userId || data.username);
                    localStorage.setItem("session_role", data.role || "admin");
                    localStorage.setItem("session_time", Date.now().toString());
                    
                    // Clear lockout variables
                    localStorage.removeItem("login_attempts");
                    localStorage.removeItem("login_lock_until");
                    
                    // Show toast & Route to dashboard
                    showToast("Login successful", "success");
                    
                    // Restore container padding for normal views
                    container.style.padding = "";
                    window.location.hash = "dashboard";
                } else {
                    handleFailedAttempt();
                }
            } else {
                handleFailedAttempt();
            }
        } catch (err) {
            console.error(err);
            showToast("Login error occurred - Server unreachable", "error");
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });

    document.getElementById("forgotPasswordBtn").addEventListener("click", async (e) => {
        e.preventDefault();
        const { showModal, showToast } = await import("../ui.js");
        
        showModal("Reset Admin Password", `
            <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 10px;">
                <p style="font-size: 14px; color: var(--text-secondary);">Only the master Admin (shafi) can reset credentials.</p>
                <input type="text" id="resetUsername" class="form-input" placeholder="Doctor ID" style="padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); width: 100%; box-sizing: border-box;">
                <input type="password" id="resetPassword" class="form-input" placeholder="New Password" style="padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); width: 100%; box-sizing: border-box;">
            </div>
        `, async () => {
            const username = document.getElementById("resetUsername").value.trim();
            const rawPass = document.getElementById("resetPassword").value;
            
            if (username !== 'shafi') {
                showToast("Only 'shafi' can reset the password", "error");
                return true; 
            }
            if (!rawPass) {
                showToast("Password cannot be empty", "error");
                return false; 
            }
            
            const newHash = await hashPassword(rawPass);
            try {
                const doctors = await getAllRecords("doctors");
                const account = doctors.find(d => d.username === username);
                
                if (account) {
                    account.password_hash = newHash;
                    await saveRecord("doctors", account);
                    showToast("Password reset successfully. Please login.", "success");
                } else {
                    showToast("Admin account not found safely offline", "error");
                }
            } catch (err) {
                showToast("DB error during reset", "error");
            }
            return true;
        }, "Reset Password");
    });
};
