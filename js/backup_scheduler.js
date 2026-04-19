import { getRecord, saveRecord, getAllRecords } from "./db.js";
import { showToast } from "./ui.js";
import { appState } from "./store.js";

const SCHEDULER_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * Perform silent Telegram backup process in the background.
 */
export const runTelegramBackup = async (isManual = false) => {
  try {
    const config = await getRecord("system_config", "telegram_settings");
    if (!config || !config.bot_token || !config.channel_id) {
      if (isManual)
        showToast("Telegram upload failed. Check configuration.", "error");
      return false;
    }

    const autoConfig = await getRecord("system_config", "auto_backup_settings");

    // Ensure manual bypasses disabled setting
    if (!isManual && (!autoConfig || !autoConfig.enabled)) {
      return false;
    }

    const safeGetAll = async (store) => {
      try {
        return await getAllRecords(store, true);
      } catch (e) {
        return [];
      }
    };

    if (isManual) showToast("Starting Backup...", "info");

    const todayStr = new Date().toISOString().split("T")[0];
    const fileName = `acu_shafi_backup_${todayStr.replace(/-/g, "_")}.json`;

    const dbData = {
      clinic_name: "Acu Shafi Clinic",
      backup_date: todayStr,
      version: "1.0",
      data: {
        patients: await safeGetAll("patients"),
        visits: await safeGetAll("visits"),
        payments: await safeGetAll("payments"),
        expenses: await safeGetAll("expenses"),
        schemes: await safeGetAll("schemes"),
        treatment_analytics: await safeGetAll("treatment_analytics"),
        system_config: await safeGetAll("system_config"),
        smart_points: await safeGetAll("smart_points"),
        seed_library: await safeGetAll("disease_library"),
      },
    };

    const jsonStr = JSON.stringify(dbData);

    // Upload to Telegram
    console.log("-> Starting backup upload to Telegram channel:", config.channel_id);

    // Convert local JSON text into explicit File binary stream
    const file = new File([jsonStr], fileName, { type: "application/json" });
    
    const formData = new FormData();
    formData.append("chat_id", config.channel_id);
    formData.append("document", file); 
    formData.append(
      "caption",
      `Acu Shafi Clinic Backup\nDate: ${todayStr}\nSystem: Acu Clinic Software\nTrigger: ${isManual ? "Manual" : "Auto Backup"}`
    );

    // Note: Letting browser automatically determine Content-Type boundary for FormData
    const response = await fetch(
      `https://api.telegram.org/bot${config.bot_token}/sendDocument`,
      {
        method: "POST",
        body: formData,
      }
    );

    const success = response.ok === true;
    const result = await response.json();
    console.log("-> Telegram API Response:", result);

    if (success && result.ok) {
      // Update last backup time
      const now = Date.now();
      await saveRecord("system_config", {
        id: "auto_backup_settings",
        key: "auto_backup_settings",
        enabled: autoConfig ? autoConfig.enabled : false,
        frequency: autoConfig ? autoConfig.frequency : "manual",
        last_backup_time: now,
      });

      if (isManual) {
        showToast("Backup uploaded successfully.", "success");
      } else {
        console.log(
          "Phase-24C: Auto backup completed successfully at",
          new Date(now).toLocaleString()
        );
        showToast("Auto backup completed successfully.", "success");
      }

      // Dispatch event for UI updates if Settings page is open
      window.dispatchEvent(new CustomEvent("backup-completed"));
      return { success: true, jsonStr, fileName };
    } else {
      console.error("-> Telegram API Error Description:", result.description);
      throw new Error(result.description || "Telegram API Error");
    }
  } catch (e) {
    console.error("Phase-24B/C Telegram backup error:", e);
    if (isManual) {
      showToast("Telegram backup failed. Local backup completed.", "warning");
    } else {
      showToast("Auto backup failed. Retrying next cycle.", "warning");
      console.error("Phase-24C: Auto backup failed. Retrying next cycle.", e);
    }
    return false;
  }
};

/**
 * Checks if auto-backup is due based on settings.
 */
const checkAndTriggerAutoBackup = async () => {
  try {
    const config = await getRecord("system_config", "auto_backup_settings");

    if (!config || !config.enabled || config.frequency === "manual") {
      return;
    }

    const now = Date.now();
    const lastBackup = config.last_backup_time || 0;
    const msSinceLastBackup = now - lastBackup;

    let shouldBackup = false;

    if (
      config.frequency === "daily" &&
      msSinceLastBackup >= 24 * 60 * 60 * 1000
    ) {
      shouldBackup = true;
    } else if (
      config.frequency === "weekly" &&
      msSinceLastBackup >= 7 * 24 * 60 * 60 * 1000
    ) {
      shouldBackup = true;
    }

    if (shouldBackup) {
      console.log("Phase-24C: Triggering scheduled auto-backup...");
      await runTelegramBackup(false);
    }
  } catch (e) {
    console.error("Auto Backup Check Error:", e);
  }
};

/**
 * Initialize the recurring backup scheduler checking interval.
 */
export const initBackupScheduler = () => {
  console.log("Phase-24C: Auto Backup Scheduler Initialized.");

  // Check immediately on load after a slight delay
  setTimeout(checkAndTriggerAutoBackup, 5000);

  // Check every 10 minutes permanently
  setInterval(checkAndTriggerAutoBackup, SCHEDULER_INTERVAL);
};
