import { getAllRecords, initDB, saveRecord, getRecord, hashPassword } from "../db.js";
import { showToast, showModal } from "../ui.js";
import { appState } from "../store.js";
import { runTelegramBackup } from "../backup_scheduler.js";
import { startRestoreFlow } from "../restore_engine.js";

export const renderSettingsView = async (container) => {
  container.innerHTML = `
        <div class="view-header">
            <h3>Settings & Sync Engine</h3>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
            
            <!-- Account Security (Phase-27) -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--brand-primary);">
                        <i class="ph ph-lock-key" style="font-size: 24px;"></i>
                        <h4 style="font-size: 1.1rem;">Account Security</h4>
                    </div>
                    <span class="badge badge-success">
                        <i class="ph ph-shield-check"></i> Secure
                    </span>
                </div>
                
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;" id="lastLoginDisplay">
                    Last login: Loading...
                </div>

                <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                    <h5 style="margin-bottom: 12px; color: var(--text-primary); font-size: 0.95rem;">Change Password</h5>
                    
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>Current Password</label>
                        <input type="password" id="secCurrentPass" class="form-control" placeholder="Enter current password" style="margin-top: 4px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>New Password</label>
                        <input type="password" id="secNewPass" class="form-control" placeholder="Min 8 chars, 1 letter, 1 number" style="margin-top: 4px;" title="Minimum 8 characters, at least 1 letter and 1 number">
                    </div>

                    <div class="form-group" style="margin-bottom: 16px;">
                        <label>Confirm New Password</label>
                        <input type="password" id="secConfirmPass" class="form-control" placeholder="Confirm new password" style="margin-top: 4px;">
                    </div>

                    <button class="primary-btn" id="secChangePassBtn" style="width: 100%;">
                        Change Password
                    </button>
                </div>
            </div>
            
            <!-- Data Safety -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--brand-secondary);">
                    <i class="ph ph-shield-check" style="font-size: 24px;"></i>
                    <h4 style="font-size: 1.1rem;">Data Safety</h4>
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 0.9rem;">
                    Your data is stored securely offline on this device. Create manual backups to ensure data is never lost.
                </p>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button class="primary-btn" id="exportDataBtn"><i class="ph ph-download-simple"></i> Export Backup (JSON)</button>
                    <button class="primary-btn" id="backupTgDataBtn" style="background-color: #0088cc;"><i class="ph ph-telegram-logo"></i> Backup to Telegram</button>
                    <button class="btn-secondary" id="importDataBtn"><i class="ph ph-upload-simple"></i> Restore from Backup</button>
                </div>
                <div style="margin-top: 16px; font-size: 0.85rem; color: var(--text-tertiary); display: flex; align-items: flex-start; gap: 6px;">
                    <i class="ph ph-info" style="font-size: 16px; color: var(--brand-secondary);"></i>
                    <span>Download your backup file from the Telegram channel and upload it here to restore the clinic.</span>
                </div>
            </div>

            <!-- SaaS Integration / Sync -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--brand-primary);">
                        <i class="ph ph-cloud-arrow-up" style="font-size: 24px;"></i>
                        <h4 style="font-size: 1.1rem;">Cloud Sync</h4>
                    </div>
                    <span class="badge ${appState.syncStatus.isOnline ? "badge-success" : "badge-neutral"}">
                        ${appState.syncStatus.isOnline ? "Online" : "Offline"}
                    </span>
                </div>
                
                <div style="border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 12px; margin-bottom: 16px; background-color: var(--bg-surface-hover);">
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px;">Tenant Details</div>
                    <div style="font-weight: 500;">${appState.tenantName} (${appState.tenantId})</div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary); margin-top: 4px;">Plan: <strong style="text-transform: uppercase;">${appState.subscriptionPlan}</strong></div>
                </div>

                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">
                    Sync engine is currently in <strong>Local-Only Mode</strong>. Cloud synchronization is disabled for the base tier.
                </p>

                <div class="form-group" style="margin-bottom: 16px;">
                    <label>Acupuncture Sub-System Features</label>
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; margin-top: 8px; cursor: pointer;">
                        <input type="checkbox" ${appState.featureFlags.enableElectroAcu ? "checked" : ""} id="toggleElectro">
                        Enable Electro-Acupuncture Fields
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; margin-top: 8px; cursor: pointer;">
                        <input type="checkbox" ${appState.featureFlags.enableVoiceRecording ? "checked" : ""} id="toggleVoice">
                        Enable Voice Feedback Recording
                    </label>
                </div>

                <div class="form-group" style="margin-top: 24px;">
                    <label>Clinic Operating Mode</label>
                    <select id="clinicModeSelect" class="form-control" style="margin-top: 8px;">
                        <option value="standard" ${localStorage.getItem("acuclinic_mode") !== "shafi_private" ? "selected" : ""}>Standard Mode</option>
                        <option value="shafi_private" ${localStorage.getItem("acuclinic_mode") === "shafi_private" ? "selected" : ""}>Shafi Private (Funds tracking)</option>
                    </select>
                </div>
            </div>

            <!-- Pattern Updates (Phase-28) -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--brand-primary);">
                        <i class="ph ph-arrows-clockwise" style="font-size: 24px;"></i>
                        <h4 style="font-size: 1.1rem;">System Updates</h4>
                    </div>
                    <span class="badge badge-neutral" id="updateBadge">Up to Date</span>
                </div>
                
                <div style="margin-bottom: 16px;">
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">Current Version:</span>
                    <strong style="font-size: 1.1rem; color: var(--text-primary); margin-left: 8px;">v2.8.0</strong>
                </div>

                <div id="updatePayloadArea" style="display: none; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 16px; margin-bottom: 16px; background-color: rgba(16, 185, 129, 0.05);">
                    <h5 style="color: var(--success); margin-bottom: 12px;">New Update Available: v2.8.1</h5>
                    <ul style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; padding-left: 16px;">
                        <li>Multi-Doctor Isolation Engine</li>
                        <li>Automated Local Backups Pre-Install</li>
                        <li>Platform Admin Dashboard</li>
                    </ul>
                    <div style="display: flex; gap: 8px;">
                        <button class="primary-btn" id="installUpdateBtn" style="background-color: var(--success); border-color: var(--success); flex: 1;">Install Now</button>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 10px;"><i class="ph ph-warning"></i> Installing will trigger an automatic database snapshot to prevent data loss.</p>
                </div>

                <button class="secondary-btn" id="checkUpdateBtn" style="width: 100%;">
                    Check for Updates
                </button>
            </div>
            
            <!-- Master Configurations (Phase-6B) -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); grid-column: 1 / -1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--brand-primary);">
                    <i class="ph ph-list-dashes" style="font-size: 24px;"></i>
                    <h4 style="font-size: 1.1rem;">Master Configurations</h4>
                </div>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">
                    Manage dropdown lists and autocomplete options used throughout the application to speed up data entry.
                </p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                    <button class="btn-secondary" style="text-align: left; display: flex; justify-content: space-between;" onclick="window.openMasterEditor('master_treatment_modes', 'Treatment Modes')">
                        Treatment Modes <i class="ph ph-caret-right"></i>
                    </button>
                    <button class="btn-secondary" style="text-align: left; display: flex; justify-content: space-between;" onclick="window.openMasterEditor('master_response_scales', 'Response Scales')">
                        Response Scales <i class="ph ph-caret-right"></i>
                    </button>
                    <button class="btn-secondary" style="text-align: left; display: flex; justify-content: space-between;" onclick="window.openMasterEditor('master_pulse_methods', 'Pulse Methods')">
                        Pulse Methods <i class="ph ph-caret-right"></i>
                    </button>
                    <button class="btn-secondary" style="text-align: left; display: flex; justify-content: space-between;" onclick="window.openMasterEditor('master_complaints', 'Complaint Master List')">
                        Complaint Master List <i class="ph ph-caret-right"></i>
                    </button>
                    <button class="btn-secondary" style="text-align: left; display: flex; justify-content: space-between;" onclick="window.viewPointMaster()">
                        Acupuncture Point Master (Read Only) <i class="ph ph-caret-right"></i>
                    </button>
                </div>
            </div>

            <!-- Auto Backup Status -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); grid-column: 1 / -1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--info);">
                    <i class="ph ph-clock-counter-clockwise" style="font-size: 24px;"></i>
                    <h4 style="font-size: 1.1rem;">Auto Local Snapshot</h4>
                </div>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">
                    The system automatically creates a stringified snapshot of your database in localStorage to protect against accidental browser cache clears.
                </p>
                <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between;">
                    <span id="lastSnapshotText" style="font-size: 0.85rem; color: var(--text-tertiary);">Checking snapshot status...</span>
                    <button class="btn-secondary" id="forceSnapshotBtn" style="padding: 6px 12px; font-size: 0.85rem;">Force Snapshot Now</button>
                </div>
            </div>

            <!-- Phase-24A: Telegram Backup Configuration -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); grid-column: 1 / -1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--brand-primary);">
                    <i class="ph ph-telegram-logo" style="font-size: 24px;"></i>
                    <h4 style="font-size: 1.1rem;">Telegram Backup Configuration</h4>
                </div>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">
                    Configure Telegram bot credentials to enable automated backups.
                </p>
                <div class="form-group" style="margin-bottom: 16px;">
                    <label>Telegram Bot Token</label>
                    <input type="password" id="tgBotToken" class="form-control" placeholder="Enter Bot Token" autocomplete="off" style="margin-top: 8px;">
                </div>
                <div class="form-group" style="margin-bottom: 16px;">
                    <label>Telegram Channel ID</label>
                    <input type="text" id="tgChannelId" class="form-control" placeholder="Enter Channel ID (e.g., -1001234567890)" style="margin-top: 8px;">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button class="primary-btn" id="saveTgConfigBtn">Save Configuration</button>
                    <button class="btn-secondary" id="testTgConnectionBtn">Test Telegram Connection</button>
                </div>
            </div>

            <!-- Phase-24C: Auto Backup Settings -->
            <div style="background: var(--bg-surface); padding: 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); grid-column: 1 / -1;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--brand-primary);">
                        <i class="ph ph-calendar-check" style="font-size: 24px;"></i>
                        <h4 style="font-size: 1.1rem;">Auto Backup Scheduler</h4>
                    </div>
                    <label class="switch" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <span style="font-size: 0.9rem; font-weight: 500;" id="autoBackupToggleLabel">OFF</span>
                        <input type="checkbox" id="autoBackupToggle" style="width: 18px; height: 18px;">
                    </label>
                </div>
                
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">
                    Automatically secure your clinic database to your Telegram Channel without manual intervention.
                </p>

                <div class="form-group" style="margin-bottom: 16px;">
                    <label>Backup Frequency</label>
                    <select id="autoBackupFrequency" class="form-control" style="margin-top: 8px;" disabled>
                        <option value="daily">Daily Backup (Every 24 Hours)</option>
                        <option value="weekly">Weekly Backup (Every 7 Days)</option>
                        <option value="manual">Manual Only</option>
                    </select>
                </div>

                <div style="display: flex; justify-content: space-between; border-top: 1px dashed var(--border-color); padding-top: 16px; margin-top: 16px;">
                    <div>
                        <div style="font-size: 0.8rem; color: var(--text-tertiary);">Last Backup</div>
                        <div style="font-weight: 500; font-size: 0.9rem; color: var(--text-primary);" id="lastAutoBackupTime">Unknown</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.8rem; color: var(--text-tertiary);">Next Scheduled</div>
                        <div style="font-weight: 500; font-size: 0.9rem; color: var(--primary-color);" id="nextAutoBackupTime">--</div>
                    </div>
                </div>
            </div>

        </div>
    `;

  // Attach local functions to window so inline onclick works
  window.openMasterEditor = openMasterEditor;
  window.viewPointMaster = viewPointMaster;

  // Export Logic
  document
    .getElementById("exportDataBtn")
    .addEventListener("click", async () => {
      try {
        const btn = document.getElementById("exportDataBtn");
        btn.innerHTML = '<i class="ph ph-spinner spin"></i> Exporting...';

        const dbData = {
          metadata: {
            version: "2.0",
            exportDate: new Date().toISOString(),
            tenantId: appState.tenantId,
          },
          patients: await getAllRecords("patients", true),
          visits: await getAllRecords("visits", true),
          payments: await getAllRecords("payments", true),
          complaints: await getAllRecords("complaints", true),
          masters: await getAllRecords("masters", true),
        };

        const dataStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(JSON.stringify(dbData));
        const downloadAnchorNode = document.createElement("a");
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute(
          "download",
          `AcuClinic_Backup_${new Date().toISOString().split("T")[0]}.json`,
        );
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        showToast("Backup downloaded successfully", "success");
        btn.innerHTML =
          '<i class="ph ph-download-simple"></i> Export Backup (JSON)';
        saveSnapshot(dbData);
      } catch (error) {
        console.error(error);
        showToast("Export failed", "error");
        document.getElementById("exportDataBtn").innerHTML =
          '<i class="ph ph-download-simple"></i> Export Backup (JSON)';
      }
    });

  document
    .getElementById("backupTgDataBtn")
    .addEventListener("click", async () => {
      const btn = document.getElementById("backupTgDataBtn");
      const oldHtml = btn.innerHTML;
      btn.innerHTML = '<i class="ph ph-spinner spin"></i> Processing...';
      btn.disabled = true;

      try {
        await runTelegramBackup(true); // true = run manually
      } catch (e) {
        console.error("Manual Telegram Backup Error:", e);
      } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
      }
    });

  document.getElementById("importDataBtn").addEventListener("click", () => {
    startRestoreFlow();
  });

  document.getElementById("toggleElectro").addEventListener("change", (e) => {
    appState.featureFlags.enableElectroAcu = e.target.checked;
    showToast("Settings updated", "success");
  });

  document.getElementById("toggleVoice").addEventListener("change", (e) => {
    appState.featureFlags.enableVoiceRecording = e.target.checked;
    showToast("Settings updated", "success");
  });

  document
    .getElementById("clinicModeSelect")
    .addEventListener("change", (e) => {
      localStorage.setItem("acuclinic_mode", e.target.value);
      showToast("Clinic mode updated", "success");
    });

    document
      .getElementById("forceSnapshotBtn")
      .addEventListener("click", async () => {
        const btn = document.getElementById("forceSnapshotBtn");
        btn.textContent = "Saving...";
        await createSnapshot();
        btn.textContent = "Force Snapshot Now";
      });

  // Phase-28: Secure Updates Mock
  document.getElementById("checkUpdateBtn").addEventListener("click", () => {
      const btn = document.getElementById("checkUpdateBtn");
      btn.innerHTML = '<i class="ph ph-spinner spin"></i> Checking...';
      setTimeout(() => {
          document.getElementById("updateBadge").textContent = "Update Found";
          document.getElementById("updateBadge").classList.replace("badge-neutral", "badge-success");
          document.getElementById("updatePayloadArea").style.display = "block";
          btn.style.display = "none";
      }, 1500);
  });

  document.getElementById("installUpdateBtn").addEventListener("click", async () => {
      const btn = document.getElementById("installUpdateBtn");
      btn.innerHTML = '<i class="ph ph-spinner spin"></i> Backing up DB...';
      btn.disabled = true;

      try {
          // 1. Force Backup Pre-Install
          await createSnapshot();
          
          btn.innerHTML = '<i class="ph ph-spinner spin"></i> Installing...';
          
          // 2. Mark update in history
          await saveRecord("system_updates", {
              version: "v2.8.1",
              released_date: new Date().toISOString(),
              description: "Multi-Doctor Engine and Pre-Install Backups",
              installed_by: localStorage.getItem("session_user") || "unknown",
              installed_at: Date.now()
          });

          // 3. Complete
          setTimeout(() => {
              showToast("System Updated to v2.8.1 successfully!", "success");
              document.getElementById("updatePayloadArea").innerHTML = `
                  <div style="text-align: center; color: var(--success); padding: 10px;">
                      <i class="ph ph-check-circle" style="font-size: 32px; margin-bottom: 8px;"></i>
                      <div>System is up to date.</div>
                  </div>
              `;
          }, 1500);

      } catch (err) {
          console.error(err);
          showToast("Update failed. Data is safe.", "error");
          btn.innerHTML = 'Install Now';
          btn.disabled = false;
      }
  });

  // Phase-27: Password Management Logic
  const loadSecurityState = async () => {
      const activeUser = localStorage.getItem("session_user");
      if (activeUser) {
          const account = await getRecord("doctor_accounts", activeUser);
          if (account && account.last_login) {
              const d = new Date(account.last_login);
              document.getElementById("lastLoginDisplay").innerHTML = `Last login: <br><strong>${d.toLocaleDateString()} ${d.toLocaleTimeString()}</strong>`;
          } else {
              document.getElementById("lastLoginDisplay").innerHTML = `Last login: <br><strong>Unknown</strong>`;
          }
      }
  };
  
  document.getElementById("secChangePassBtn").addEventListener("click", async () => {
      const currentPass = document.getElementById("secCurrentPass").value;
      const newPass = document.getElementById("secNewPass").value;
      const confirmPass = document.getElementById("secConfirmPass").value;

      if (!currentPass || !newPass || !confirmPass) {
          showToast("Please fill in all security fields.", "warning");
          return;
      }

      // Validate Complexity
      const pwdRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
      if (!pwdRegex.test(newPass)) {
          showToast("Weak password. Must be at least 8 characters, containing 1 letter and 1 number.", "error");
          return;
      }

      if (newPass !== confirmPass) {
          showToast("New passwords do not match.", "error");
          return;
      }

      const btn = document.getElementById("secChangePassBtn");
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="ph ph-spinner spin"></i> Updating...';
      btn.disabled = true;

      try {
          const activeUser = localStorage.getItem("session_user") || "admin";
          const account = await getRecord("doctor_accounts", activeUser);
          
          if (!account) {
               showToast("Account error. Try logging out and back in.", "error");
               return;
          }

          const currentHash = await hashPassword(currentPass);
          if (currentHash !== account.password_hash) {
              showToast("Incorrect current password.", "error");
              return;
          }

          // Update password
          const newHash = await hashPassword(newPass);
          account.password_hash = newHash;
          await saveRecord("doctor_accounts", account);

          showToast("Password changed successfully", "success");
          
          // Clear form
          document.getElementById("secCurrentPass").value = "";
          document.getElementById("secNewPass").value = "";
          document.getElementById("secConfirmPass").value = "";

      } catch (err) {
          console.error("Password change failed:", err);
          showToast("Password change failed.", "error");
      } finally {
          btn.innerHTML = originalText;
          btn.disabled = false;
      }
  });

  loadSecurityState();

  // Phase-24A: Load Telegram Config
  const loadTelegramConfig = async () => {
    try {
      let config = null;
      try {
          const response = await fetch('/api/config/telegram');
          if (response.ok) {
              const result = await response.json();
              if (result.success && result.config) {
                  config = result.config;
                  // Sync to local DB just in case
                  if (config.bot_token) {
                      await saveRecord("system_config", {
                          id: "telegram_settings",
                          key: "telegram_settings",
                          bot_token: config.bot_token,
                          channel_id: config.chat_id || config.channel_id,
                          last_updated: Date.now(),
                      });
                  }
              }
          }
      } catch (err) {
          console.log("Backend API not reachable, falling back to local DB for config.");
      }

      if (!config || !config.bot_token) {
          config = await getRecord("system_config", "telegram_settings");
      }

      if (config) {
        document.getElementById("tgBotToken").value = config.bot_token || "";
        document.getElementById("tgChannelId").value = config.chat_id || config.channel_id || "";
      }

      // Phase-24C: Load Auto Scheduler Config
      const autoConfig = (await getRecord(
        "system_config",
        "auto_backup_settings",
      )) || {
        enabled: false,
        frequency: "daily",
        last_backup_time: 0,
      };

      const tgToggle = document.getElementById("autoBackupToggle");
      const freqSelect = document.getElementById("autoBackupFrequency");
      const toggleLabel = document.getElementById("autoBackupToggleLabel");

      tgToggle.checked = autoConfig.enabled;
      freqSelect.value = autoConfig.frequency || "daily";
      freqSelect.disabled = !autoConfig.enabled;
      toggleLabel.textContent = autoConfig.enabled ? "ON" : "OFF";
      toggleLabel.style.color = autoConfig.enabled
        ? "var(--success)"
        : "var(--text-tertiary)";

      updateScheduleUI(autoConfig);

      // Bind Auto Backup Checkbox
      tgToggle.addEventListener("change", async (e) => {
        const isEnabled = e.target.checked;
        freqSelect.disabled = !isEnabled;
        toggleLabel.textContent = isEnabled ? "ON" : "OFF";
        toggleLabel.style.color = isEnabled
          ? "var(--success)"
          : "var(--text-tertiary)";

        try {
          const latestAutoConfig = (await getRecord(
            "system_config",
            "auto_backup_settings",
          )) || { last_backup_time: 0 };
          await saveRecord("system_config", {
            key: "auto_backup_settings",
            enabled: isEnabled,
            frequency: freqSelect.value,
            last_backup_time: latestAutoConfig.last_backup_time,
          });

          if (isEnabled) {
            // Force an immediate check
            setTimeout(
              () => window.dispatchEvent(new CustomEvent("backup-completed")),
              500,
            );
          } else {
            updateScheduleUI({
              enabled: false,
              last_backup_time: latestAutoConfig.last_backup_time,
            });
          }
          showToast("Auto Backup Settings Updated", "success");
        } catch (err) {
          console.error("Failed to save auto backup config", err);
        }
      });

      // Bind Frequency Select
      freqSelect.addEventListener("change", async (e) => {
        try {
          const latestAutoConfig = (await getRecord(
            "system_config",
            "auto_backup_settings",
          )) || { last_backup_time: 0 };
          const newConfig = {
            key: "auto_backup_settings",
            enabled: tgToggle.checked,
            frequency: e.target.value,
            last_backup_time: latestAutoConfig.last_backup_time,
          };
          await saveRecord("system_config", newConfig);
          updateScheduleUI(newConfig);
          showToast("Backup Frequency Updated", "success");
        } catch (err) {
          console.error("Failed to save freq config", err);
        }
      });
    } catch (e) {
      console.error("Error loading configs:", e);
    }
  };

  // UI Update Helper for Phase-24C Scheduler
  const updateScheduleUI = (autoConfig) => {
    const lastEl = document.getElementById("lastAutoBackupTime");
    const nextEl = document.getElementById("nextAutoBackupTime");

    if (autoConfig.last_backup_time > 0) {
      const lastD = new Date(autoConfig.last_backup_time);
      lastEl.textContent = lastD.toLocaleString([], {
        dateStyle: "short",
        timeStyle: "short",
      });

      if (autoConfig.enabled && autoConfig.frequency !== "manual") {
        const msToAdd =
          autoConfig.frequency === "daily"
            ? 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;
        const nextD = new Date(autoConfig.last_backup_time + msToAdd);
        nextEl.textContent = nextD.toLocaleString([], {
          dateStyle: "short",
          timeStyle: "short",
        });
        if (Date.now() > autoConfig.last_backup_time + msToAdd) {
          nextEl.textContent = "Due Now";
          nextEl.style.color = "var(--warning)";
        } else {
          nextEl.style.color = "var(--primary-color)";
        }
      } else {
        nextEl.textContent = "Disabled / Manual";
        nextEl.style.color = "var(--text-tertiary)";
      }
    } else {
      lastEl.textContent = "Never";
      nextEl.textContent = autoConfig.enabled ? "Processing..." : "Disabled";
    }
  };

  // Listen for background updates
  window.addEventListener("backup-completed", async () => {
    const autoConfig = await getRecord("system_config", "auto_backup_settings");
    if (autoConfig) updateScheduleUI(autoConfig);
  });

  loadTelegramConfig();

  // Phase-24A: Telegram Config Logic
  document
    .getElementById("saveTgConfigBtn")
    .addEventListener("click", async () => {
      const token = document.getElementById("tgBotToken").value.trim();
      const channelId = document.getElementById("tgChannelId").value.trim();

      if (!token || !channelId) {
        showToast("Warning: Bot Token and Channel ID are required", "warning");
        return;
      }

      try {
        const btn = document.getElementById("saveTgConfigBtn");
        btn.textContent = "Saving...";

        // 1. Save to Backend if reachable
        try {
            await fetch('/api/config/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bot_token: token, chat_id: channelId })
            });
        } catch (err) {
            console.log("Backend API not reachable, saving only to local DB.");
        }

        // 2. Save offline locally
        await saveRecord("system_config", {
          id: "telegram_settings",
          key: "telegram_settings",
          bot_token: token,
          channel_id: channelId,
          last_updated: Date.now(),
        });

        showToast("Telegram Configuration Saved", "success");
        btn.textContent = "Save Configuration";
      } catch (e) {
        console.error(e);
        showToast("Failed to save configuration", "error");
        document.getElementById("saveTgConfigBtn").textContent =
          "Save Configuration";
      }
    });

  document
    .getElementById("testTgConnectionBtn")
    .addEventListener("click", async () => {
      const token = document.getElementById("tgBotToken").value.trim();
      const channelId = document.getElementById("tgChannelId").value.trim();

      if (!token || !channelId) {
        showToast(
          "Warning: Please save configuration before testing",
          "warning",
        );
        return;
      }

      const btn = document.getElementById("testTgConnectionBtn");
      btn.innerHTML = '<i class="ph ph-spinner spin"></i> Testing...';

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: channelId,
              text: "🩺 AcuClinic System: Test connection successful!",
            }),
          },
        );

        const result = await response.json();
        if (result.ok) {
          showToast("Test message sent successfully!", "success");
        } else {
          showToast(`Telegram Error: ${result.description}`, "error");
        }
      } catch (e) {
        console.error(e);
        showToast("Failed to connect to Telegram", "error");
      } finally {
        btn.textContent = "Test Telegram Connection";
      }
    });

  updateSnapshotStatus();
};

// processImport logic moved to restore_engine.js

const createSnapshot = async () => {
  try {
    const dbData = {
      metadata: { timestamp: new Date().toISOString() },
      patients: await getAllRecords("patients", true),
      visits: await getAllRecords("visits", true),
      payments: await getAllRecords("payments", true),
      complaints: await getAllRecords("complaints", true),
      masters: await getAllRecords("masters", true),
    };
    saveSnapshot(dbData);
    showToast("Snapshot saved", "success");
  } catch (e) {
    console.error("Snapshot error:", e);
  }
};

const saveSnapshot = (data) => {
  try {
    const strInfo = JSON.stringify(data);
    localStorage.setItem("acuclinic_auto_snapshot", strInfo);
    localStorage.setItem(
      "acuclinic_snapshot_time",
      data.metadata.timestamp || new Date().toISOString(),
    );
    updateSnapshotStatus();
  } catch (e) {
    console.warn("localStorage quota exceeded for snapshot", e);
    showToast("Storage quota exceeded. Cannot save snapshot.", "warning");
  }
};

const updateSnapshotStatus = () => {
  const statusEl = document.getElementById("lastSnapshotText");
  if (!statusEl) return;

  const lastTime = localStorage.getItem("acuclinic_snapshot_time");
  if (lastTime) {
    const d = new Date(lastTime);
    statusEl.innerHTML = `Last snapshot: <strong>${d.toLocaleDateString()} ${d.toLocaleTimeString()}</strong>`;
  } else {
    statusEl.textContent = "No snapshots created yet.";
  }
};

// ==========================================
// Master Configuration Editors
// ==========================================
const openMasterEditor = async (masterId, title) => {
  let masterRecord = await getRecord("masters", masterId);
  if (!masterRecord) {
    masterRecord = {
      id: masterId,
      type: masterId.replace("master_", ""),
      list: [],
    };
  }

  const renderList = () => {
    const listHtml =
      masterRecord.list
        .map(
          (item, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color);">
                <span>${escapeHtml(item)}</span>
                <button class="icon-btn danger-text" type="button" onclick="window.removeMasterItem(${index})"><i class="ph ph-trash"></i></button>
            </div>
        `,
        )
        .join("") ||
      '<p style="color: var(--text-tertiary); padding: 10px;">No items. Add one below.</p>';
    return listHtml;
  };

  const formHtml = `
        <div style="margin-bottom: 16px; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); max-height: 300px; overflow-y: auto;" id="masterItemsContainer">
            ${renderList()}
        </div>
        <div style="display: flex; gap: 8px;">
            <input type="text" id="newMasterItem" class="form-control" style="flex: 1;" placeholder="Add new option...">
            <button class="primary-btn" type="button" id="addMasterItemBtn">Add</button>
        </div>
    `;

  // Assign temporary global actions specifically for this modal's lifecycle
  window.removeMasterItem = (index) => {
    masterRecord.list.splice(index, 1);
    document.getElementById("masterItemsContainer").innerHTML = renderList();
  };

  showModal(`Edit: ${title}`, formHtml, async () => {
    try {
      await saveRecord("masters", masterRecord);
      showToast(`${title} updated`, "success");
      return true;
    } catch (e) {
      showToast("Failed to save", "error");
      return false;
    }
  });

  const inputEl = document.getElementById("newMasterItem");
  const addBtn = document.getElementById("addMasterItemBtn");

  const handleAdd = () => {
    const val = inputEl.value.trim();
    if (val && !masterRecord.list.includes(val)) {
      masterRecord.list.push(val);
      document.getElementById("masterItemsContainer").innerHTML = renderList();
      inputEl.value = "";
      inputEl.focus();
    }
  };

  addBtn.addEventListener("click", handleAdd);
  inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  });

  setTimeout(() => inputEl.focus(), 100);
};

const viewPointMaster = () => {
  // Read only view of point channels
  const channels = {
    LU: 11,
    LI: 20,
    ST: 45,
    SP: 21,
    HT: 9,
    SI: 19,
    UB: 67,
    KI: 27,
    PC: 9,
    SJ: 23,
    GB: 44,
    LR: 14,
  };

  const html = Object.keys(channels)
    .map(
      (ch) => `
        <div style="padding: 10px; border-bottom: 1px solid var(--border-color);">
            <strong>${ch}</strong> (1-${channels[ch]})
        </div>
    `,
    )
    .join("");

  showModal(
    "Acupuncture Point Master (Read-Only)",
    `
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
            ${html}
        </div>
        <p style="margin-top: 12px; font-size: 0.85rem; color: var(--text-secondary);">
            The Smart Point autocomplete uses this core data module to automatically suggest points during visit logging.
        </p>
    `,
    null,
  );
};

const escapeHtml = (unsafe) => {
  if (!unsafe) return "";
  return (unsafe || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
