import { getAllRecords, saveRecord, hashPassword, getRecord } from "../db.js";
import { showToast, showModal } from "../ui.js";

export const renderAdminDashboard = async (container) => {
    container.innerHTML = `
        <div class="view-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h3 style="color: var(--brand-primary);"><i class="ph ph-shield-star"></i> Platform Administration</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">Manage clinic tenants and system health</p>
            </div>
            <button class="primary-btn" id="adminCreateDocBtn"><i class="ph ph-plus"></i> Add New Doctor</button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-top: 24px;">
            <!-- Key Metrics -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--text-primary);">
                    <i class="ph ph-chart-bar" style="font-size: 24px; color: var(--primary-color);"></i>
                    <h4 style="font-size: 1.1rem;">Platform Analytics (Anonymized)</h4>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--border-color);">
                    <span style="color: var(--text-secondary);">Total Registered Doctors</span>
                    <strong style="font-size: 1.2rem;" id="admMeterDocs">...</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--border-color);">
                    <span style="color: var(--text-secondary);">Total Platform Patients</span>
                    <strong style="font-size: 1.2rem;" id="admMeterPts">...</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
                    <span style="color: var(--text-secondary);">Total Platform Visits</span>
                    <strong style="font-size: 1.2rem;" id="admMeterVisits">...</strong>
                </div>
            </div>
            
            <!-- Doctor List -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); grid-column: 1 / -1;">
                <h4 style="margin-bottom: 16px; font-size: 1.1rem; color: var(--text-primary);">Active Clinic Accounts</h4>
                <div style="overflow-x: auto;">
                    <table class="data-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                                <th style="padding: 12px; color: var(--text-secondary); font-weight: 500;">Account ID</th>
                                <th style="padding: 12px; color: var(--text-secondary); font-weight: 500;">Doctor Name</th>
                                <th style="padding: 12px; color: var(--text-secondary); font-weight: 500;">Username</th>
                                <th style="padding: 12px; color: var(--text-secondary); font-weight: 500;">Status</th>
                                <th style="padding: 12px; color: var(--text-secondary); font-weight: 500;">Role</th>
                                <th style="padding: 12px; color: var(--text-secondary); font-weight: 500;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="adminDoctorTableBody">
                            <tr><td colspan="6" style="padding: 20px; text-align: center;"><i class="ph ph-spinner spin"></i> Loading accounts...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Load Data
    const loadPlatformData = async () => {
        try {
            const doctors = await getAllRecords("doctors");
            const patients = await getAllRecords("patients");
            const visits = await getAllRecords("visits");

            document.getElementById("admMeterDocs").textContent = doctors.length;
            document.getElementById("admMeterPts").textContent = patients.length;
            document.getElementById("admMeterVisits").textContent = visits.length;

            const tableBody = document.getElementById("adminDoctorTableBody");
            
            if (doctors.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-tertiary);">No accounts found.</td></tr>';
            } else {
                tableBody.innerHTML = doctors.map(d => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 12px; font-family: monospace; font-weight: 600;">${d.id}</td>
                        <td style="padding: 12px;"><strong>${d.name}</strong><br><span style="font-size: 12px; color: var(--text-tertiary);">${d.clinic_name}</span></td>
                        <td style="padding: 12px;">${d.username}</td>
                        <td style="padding: 12px;">
                            <span class="badge ${d.status === 'active' ? 'badge-success' : 'badge-error'}">${d.status.toUpperCase()}</span>
                        </td>
                        <td style="padding: 12px;"><span class="badge badge-neutral">${d.role.toUpperCase()}</span></td>
                        <td style="padding: 12px;">
                            ${d.role === "doctor" ? `<button class="secondary-btn btn-sm" onclick="window.adminResetDoctorPass('${d.id}')" style="margin-right: 8px;">Reset Pass</button>` : ''}
                            ${d.id !== 'admin' ? `<button class="secondary-btn btn-sm" onclick="window.adminToggleDoctorStatus('${d.id}')">${d.status === 'active' ? 'Suspend' : 'Activate'}</button>` : ''}
                        </td>
                    </tr>
                `).join('');
            }

        } catch (e) {
            console.error("Admin dash load error", e);
            showToast("Failed to load platform data.", "error");
        }
    };

    // Attach globals for inline buttons
    window.adminResetDoctorPass = async (id) => {
        const d = await getRecord("doctors", id);
        if (!d) return;

        showModal(`Reset Password: ${d.name}`, `
            <p style="margin-bottom:12px;">Please enter a new temporary password for <strong>${d.username}</strong>. They should change it upon their next login.</p>
            <input type="password" id="adminResetPassInput" class="form-control" placeholder="New Password">
        `, async () => {
            const newPass = document.getElementById("adminResetPassInput").value;
            if (newPass.length < 6) {
                showToast("Password too short.", "warning");
                return false;
            }
            try {
                d.password_hash = await hashPassword(newPass);
                await saveRecord("doctors", d);
                showToast("Password reset successfully.", "success");
                return true;
            } catch (e) {
                showToast("Reset failed.", "error");
                return false;
            }
        });
    };

    window.adminToggleDoctorStatus = async (id) => {
        if (confirm("Toggle account access status?")) {
            const d = await getRecord("doctors", id);
            if (d) {
                d.status = d.status === "active" ? "suspended" : "active";
                await saveRecord("doctors", d);
                showToast(`Account set to ${d.status}`, "success");
                loadPlatformData();
            }
        }
    };

    document.getElementById("adminCreateDocBtn").addEventListener("click", () => {
        showModal("Create New Doctor Account", `
            <div class="form-group" style="margin-bottom: 12px;">
                <label>Doctor Name</label>
                <input type="text" id="newDocName" class="form-control" placeholder="Dr. John Doe">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label>Clinic/Facility Name</label>
                <input type="text" id="newDocClinic" class="form-control" placeholder="City Clinic">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label>Login Username</label>
                <input type="text" id="newDocUsername" class="form-control" placeholder="johndoe">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label>Initial Password</label>
                <input type="password" id="newDocPass" class="form-control" placeholder="Min 8 chars, 1 letter, 1 number">
            </div>
        `, async () => {
            const name = document.getElementById("newDocName").value.trim();
            const clinic = document.getElementById("newDocClinic").value.trim();
            const username = document.getElementById("newDocUsername").value.trim();
            const pass = document.getElementById("newDocPass").value;

            if (!name || !username || !pass) {
                showToast("Please fill all required fields.", "warning");
                return false;
            }

            // check duplicate username
            const allDocs = await getAllRecords("doctors");
            if (allDocs.find(d => d.username.toLowerCase() === username.toLowerCase())) {
                showToast("Username already exists.", "error");
                return false;
            }

            try {
                 // Generate ID DOC-XXXX
                 let maxNum = 0;
                 allDocs.forEach(d => {
                     if (d.id.startsWith("DOC-")) {
                         const n = parseInt(d.id.replace("DOC-", ""));
                         if (!isNaN(n) && n > maxNum) maxNum = n;
                     }
                 });
                 const newId = "DOC-" + String(maxNum + 1).padStart(4, "0");
                 
                 const hash = await hashPassword(pass);
                 
                 const docRecord = {
                     id: newId,
                     name,
                     clinic_name: clinic,
                     username,
                     password_hash: hash,
                     role: "doctor",
                     status: "active",
                     created_at: Date.now()
                 };

                 await saveRecord("doctors", docRecord);
                 showToast("New doctor account created!", "success");
                 loadPlatformData();
                 return true;
            } catch (e) {
                console.error(e);
                showToast("Failed to create account.", "error");
                return false;
            }
        });
    });

    loadPlatformData();
};
