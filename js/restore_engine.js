import { clearStore, saveRecord } from "./db.js";
import { showToast, showModal } from "./ui.js";

const STORES_TO_RESTORE = [
  "patients",
  "visits",
  "payments",
  "expenses",
  "schemes",
  "scheme_sessions",
  "patient_schemes",
  "treatment_analytics",
  "system_config",
  "smart_points",
  "disease_library",
  "complaints",
  "masters",
  "booking_requests",
  "no_show_records",
];

export const startRestoreFlow = () => {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";
  fileInput.style.display = "none";

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // Phase-25: Strict Validation
        if (!data.clinic_name && !data.patients) {
          // Support v1 and v2 backups
          throw new Error("Invalid backup file structure.");
        }

        showModal(
          "Warning: Destructive Action",
          `
                    <div style="color: var(--error); margin-bottom: 16px; font-weight: 500;">
                        Wait! Restoring this backup will permanently replace ALL current clinic data on this device.
                    </div>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">
                        Are you absolutely sure you want to proceed and overwrite the database with the backup from: <br>
                        <strong>${data.backup_date || data.metadata?.exportDate || "Unknown Date"}</strong>?
                    </p>
                    `,
          async () => {
            await executeRestore(data);
            return true;
          },
        );
      } catch (err) {
        console.error("Restore validation error:", err);
        showToast("Invalid backup file.", "error");
      }
    };
    reader.readAsText(file);
  });

  document.body.appendChild(fileInput);
  fileInput.click();
  fileInput.remove();
};

const executeRestore = async (backupPayload) => {
  // Standardize data source between backup versions
  const sourceData = backupPayload.data || backupPayload;

  showToast("Loading backup file...", "info");

  // Disable UI interaction to prevent corruption
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0,0,0,0.8)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.justifyContent = "center";
  overlay.style.alignItems = "center";
  overlay.style.color = "white";

  overlay.innerHTML = `
        <i class="ph ph-spinner spin" style="font-size: 48px; margin-bottom: 20px; color: var(--primary-color);"></i>
        <h2 id="restoreProgressMsg">Preparing to restore...</h2>
        <p style="color: #aaa; margin-top: 10px;">Do not close or refresh the browser.</p>
    `;
  document.body.appendChild(overlay);

  const updateMsg = (msg) => {
    const el = document.getElementById("restoreProgressMsg");
    if (el) el.textContent = msg;
    console.log(`Phase-25 Restore: ${msg}`);
  };

  try {
    updateMsg("Clearing current database...");

    for (const store of STORES_TO_RESTORE) {
      try {
        await clearStore(store);
      } catch (clearErr) {
        // Ignore if store doesn't exist yet
        console.warn(`Could not clear store ${store}:`, clearErr);
      }
    }

    const keys = Object.keys(sourceData);

    for (const key of keys) {
      if (STORES_TO_RESTORE.includes(key) && Array.isArray(sourceData[key])) {
        updateMsg(`Restoring ${key}...`);
        const records = sourceData[key];
        for (const rec of records) {
          await saveRecord(key, rec);
        }
      }
    }

    updateMsg("Database indices rebuilding...");

    // Brief pause for UI perception
    await new Promise((r) => setTimeout(r, 1000));

    overlay.remove();
    showToast("Restore completed successfully.", "success");

    // Force completely clean reload
    setTimeout(() => {
      window.location.hash = ""; // reset to dashboard
      window.location.reload();
    }, 1500);
  } catch (e) {
    console.error("Fatal Restore Error:", e);
    overlay.remove();
    showToast(
      "Restore failed. Database may be in an inconsistent state.",
      "error",
    );
  }
};
