import { initDB, injectDiseaseSeedLibrary, migrateAirToMetal, injectAuthSeedData } from "./db.js";
import { renderPatientsView } from "./pages/patients.js";
import { renderVisitsView } from "./pages/visits.js";
import { renderPaymentsView } from "./pages/payments.js";
import { renderSettingsView } from "./pages/settings.js";
import { renderPatientProfileView } from "./pages/patient_profile.js";
import { renderSchemesView } from "./pages/schemes.js";
import { renderExpensesView } from "./pages/expenses.js";
import { renderFinanceView } from "./pages/finance.js";
import { renderAnalyticsView } from "./pages/analytics.js";
import { renderAvailabilityView } from "./pages/availability.js";
import { initBackupScheduler } from "./backup_scheduler.js";
import { renderLoginView } from "./pages/login.js";
import { renderAdminDashboard } from "./pages/admin_dashboard.js";

// Simple SPA Router implementation
const routes = {
  login: () => renderLoginView(document.getElementById("router-view")),
  dashboard: () => renderDashboard(),
  patients: () => renderPatientsView(document.getElementById("router-view")),
  patient: (id) =>
    renderPatientProfileView(document.getElementById("router-view"), id),
  visits: () => renderVisitsView(document.getElementById("router-view")),
  payments: () => renderPaymentsView(document.getElementById("router-view")),
  schemes: () => renderSchemesView(document.getElementById("router-view")),
  expenses: () => renderExpensesView(document.getElementById("router-view")),
  finance: () => renderFinanceView(document.getElementById("router-view")),
  analytics: () => renderAnalyticsView(document.getElementById("router-view")),
  availability: () =>
    renderAvailabilityView(document.getElementById("router-view")),
  settings: () => renderSettingsView(document.getElementById("router-view")),
  admin: () => renderAdminDashboard(document.getElementById("router-view"))
};

const router = () => {
  // Get current hash, fallback to dashboard
  let hash = window.location.hash.slice(1) || "dashboard";

  // Auth Middleware & Phase-27 Session Expiry
  const isSessionActive = localStorage.getItem("session_active") === "true";
  const sessionTime = parseInt(localStorage.getItem("session_time") || "0", 10);

  if (isSessionActive && sessionTime > 0) {
    if (Date.now() - sessionTime > 15 * 60 * 1000) {
      // Expired
      localStorage.removeItem("session_active");
      localStorage.removeItem("session_user");
      localStorage.removeItem("session_time");
      window.location.hash = "login";
      import("./ui.js").then(({ showToast }) => showToast("Session expired. Please log in again.", "warning"));
      return;
    }
  }

  if (!isSessionActive && hash !== "login") {
    window.location.hash = "login";
    return;
  }

  const [route, id] = hash.split("/");

  // Security check for Admin route
  if (route === "admin") {
    const sessionUser = localStorage.getItem("session_user");
    const otpToken = localStorage.getItem("session_otp_token");

    if (sessionUser !== "shafi" || !otpToken) {
      window.location.hash = "dashboard";
      return;
    }
  }

  const viewContainer = document.getElementById("router-view");
  const routeFunc = routes[route];

  // Layout Adjustments
  const sidebar = document.getElementById("sidebar");
  const topbar = document.querySelector(".topbar");

  // Conditionally render sidebar items based on role
  // Conditionally render sidebar items. Completely hide native admin button.
  document.querySelectorAll(".nav-item").forEach(el => {
    const elRoute = el.dataset.route;
    if (elRoute === "admin") {
      el.style.display = "none";
    } else {
      el.style.display = "flex";
    }
  });

  if (route !== "login") {
    if (sidebar) sidebar.style.display = "";
    if (topbar) {
      topbar.style.display = "";
      const roleLabelEl = document.getElementById("roleLabel");
      if (roleLabelEl) {
        const role = localStorage.getItem("session_role");
        roleLabelEl.textContent = role === "admin" ? "Platform Administrator" : "Clinic Doctor";
        roleLabelEl.style.color = role === "admin" ? "var(--warning)" : "var(--text-secondary)";
      }

      // Inject / Toggle dynamic admin panel button
      const sessionUser = localStorage.getItem("session_user");
      let adminBtn = document.getElementById("topbarAdminBtn");

      if (sessionUser === "shafi") {
        if (!adminBtn) {
          const topbarActions = document.querySelector(".topbar-actions");
          if (topbarActions) {
            topbarActions.insertAdjacentHTML('afterbegin', `
                        <button class="secondary-btn btn-sm pulse-glow" id="topbarAdminBtn" style="border-color: var(--warning); color: var(--warning); font-weight: 600; padding: 6px 12px; border-radius: var(--radius-md);">
                            <i class="ph ph-shield-star"></i> Admin Panel
                        </button>
                    `);
            document.getElementById("topbarAdminBtn").addEventListener("click", triggerAdminAuthFlow);
          }
        } else {
          adminBtn.style.display = "flex";
        }
      } else {
        if (adminBtn) adminBtn.style.display = "none";
      }
    }
    viewContainer.style.padding = "";
  }

  if (routeFunc) {
    viewContainer.innerHTML =
      '<div class="loading-state"><i class="ph ph-spinner-gap spin"></i><p>Loading...</p></div>';
    updateActiveNav(route);
    routeFunc(id);
  } else {
    viewContainer.innerHTML = "<h2>404 - Page Not Found</h2>";
  }

  // Close sidebar on mobile after navigation
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.remove("open");
  }
};

const updateActiveNav = (currentRoute) => {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.route === currentRoute) {
      item.classList.add("active");
    }
  });
};

const triggerAdminAuthFlow = async () => {
  const { showModal, showToast } = await import("./ui.js");
  const { hashPassword } = await import("./db.js");

  // Target bypass if session OTP is already valid for convenience
  if (localStorage.getItem("session_otp_token")) {
    window.location.hash = "admin";
    return;
  }

  // STEP 1: Re-authenticate
  showModal("Admin Verification", `
        <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 10px;">
            <p style="font-size: 14px; color: var(--text-secondary);">Please verify your password to access the secure Admin Panel.</p>
            <input type="password" id="reauthPassword" class="form-input" placeholder="Enter Password" style="padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); width: 100%; box-sizing: border-box;">
        </div>
    `, async () => {
        const password = document.getElementById("reauthPassword").value;
        if (!password) { showToast("Password cannot be empty", "error"); return false; }
        
        try {
            const passHash = await hashPassword(password);
            const { getAllRecords } = await import("./db.js");
            const doctors = await getAllRecords("doctors");
            const account = doctors.find(d => d.username === "shafi");

            if (account && account.password_hash === passHash) {
                setTimeout(() => startOtpFlow(), 300);
                return true; 
            } else {
                showToast("Invalid password", "error");
                return false;
            }
        } catch (e) { 
            showToast("Database error", "error"); 
            return true; 
        }
    }, "Continue");
};

const startOtpFlow = async () => {
    const { showModal, showToast } = await import("./ui.js");
    try {
        window._localSimulatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`\n================ WARNING: ADMIN ACCESS REQUESTED ================`);
        console.log(`>> SIMULATED LOCAL OTP CODE: ${window._localSimulatedOTP}`);
        console.log(`=================================================================\n`);
        
        showModal("OTP Verification", `
            <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 10px;">
                <p style="font-size: 14px; color: var(--text-secondary);">An OTP has been generated locally. Please check your F12 Developer Console.</p>
                <input type="text" id="otpInput" class="form-input" placeholder="Enter 6-digit OTP" style="padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); width: 100%; box-sizing: border-box; text-align: center; font-size: 18px; letter-spacing: 2px; font-weight: bold;">
            </div>
        `, async () => {
            const otpCode = document.getElementById("otpInput").value.trim();
            if (!otpCode) { showToast("OTP is required", "error"); return false; }
            
            if (otpCode === window._localSimulatedOTP) {
                window._localSimulatedOTP = null; 
                localStorage.setItem("session_otp_token", "trusted-admin-session-" + Date.now());
                showToast("Admin access granted", "success");
                window.location.hash = "admin";
                return true;
            } else {
                showToast("Invalid OTP", "error");
                return false;
            }
        }, "Verify & Access");
    } catch (err) {
         showToast("Failed to generate OTP", "error");
    }
};

// UI Interaction bindings
const bindGlobalUI = () => {
  const sidebar = document.getElementById("sidebar");
  const openBtn = document.getElementById("openSidebarBtn");
  const closeBtn = document.getElementById("closeSidebarBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  openBtn.addEventListener("click", () => sidebar.classList.add("open"));
  closeBtn.addEventListener("click", () => sidebar.classList.remove("open"));

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const { showModal } = await import("./ui.js");
      showModal("Logout", "<p>Are you sure you want to logout?</p>", () => {
          localStorage.removeItem("session_active");
          localStorage.removeItem("session_user");
          localStorage.removeItem("session_time");
          localStorage.removeItem("session_otp_token");
          window.location.hash = "login";
          return true; // close modal
      }, "Yes, Logout");
    });
  }

  window.addEventListener("hashchange", router);
};

const initSessionTimer = () => {
  let inactivityTimer;
  const resetTimer = () => {
    clearTimeout(inactivityTimer);
    // 15 minutes = 15 * 60 * 1000
    inactivityTimer = setTimeout(() => {
      if (localStorage.getItem("session_active") === "true") {
        localStorage.removeItem("session_active");
        localStorage.removeItem("session_user");
        localStorage.removeItem("session_time");
        localStorage.removeItem("session_otp_token");
        window.location.hash = "login";
        import("./ui.js").then(({showToast}) => showToast("Session expired due to inactivity", "warning"));
      }
    }, 15 * 60 * 1000);
  };

  window.addEventListener("mousemove", resetTimer);
  window.addEventListener("keydown", resetTimer);
  window.addEventListener("click", resetTimer);
  resetTimer();
};

// Application Boot
let appBooted = false;
const bootApp = async () => {
  if (appBooted) return;
  appBooted = true;
  
  console.log("Initializing AcuClinic...");

  try {
    const bootSequence = async () => {
      await initDB();
      await injectAuthSeedData();
      initSessionTimer();
      await injectDiseaseSeedLibrary();
      await migrateAirToMetal();
      
      try {
        const { saveRecord } = await import("./db.js");
        const response = await fetch('/api/config/telegram');
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.config && result.config.bot_token) {
                await saveRecord("system_config", {
                    id: "telegram_settings",
                    key: "telegram_settings",
                    bot_token: result.config.bot_token,
                    channel_id: result.config.chat_id || result.config.channel_id,
                    last_updated: Date.now(),
                });
            }
        }
      } catch (e) {}

      initBackupScheduler();
    };

    // Ensure we don't wait forever for IndexedDB
    await Promise.race([
      bootSequence(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("IndexedDB timeout")), 3000))
    ]);

    console.log("Database sequences verified.");
  } catch (error) {
    console.error("Boot failed or timed out:", error);
    // Safe fallback: continue to render empty UI instead of blocking
  }

  // ALWAYS guarantee UI render
  bindGlobalUI();
  router();

  // [Phase-28] Verification
  setTimeout(verifyMultiDoctorMigration, 2000);
};

const verifyMultiDoctorMigration = async () => {
    try {
        const { getAllRecords } = await import("./db.js");
        const docs = await getAllRecords("doctors");
        const pts = await getAllRecords("patients");
        
        console.log("== PHASE 28 VERIFICATION DATA == ");
        console.log("Doctors found:", docs.map(d => "[" + d.role + "] " + d.id + " - " + d.name));
        
        const doc1Pts = pts.filter(p => p.doctor_id === "DOC-0001").length;
        const unassignedPts = pts.filter(p => !p.doctor_id).length;
        console.log("Patients assigned to DOC-0001: " + doc1Pts);
        console.log("Patients unassigned: " + unassignedPts);
        console.log("================================");
    } catch (e) {
        console.error("Verification script failed", e);
    }
};

// Render Placeholder Functions
// Dashboard logic with Today's Bookings
const renderDashboard = async () => {
  const view = document.getElementById("router-view");
  const pageTitle = document.getElementById("pageTitle");
  pageTitle.textContent = "Dashboard";

  view.innerHTML = `
  <div class="loading-state"><i class="ph ph-spinner-gap spin"></i><p>Loading Dashboard...</p></div>
    `;

  try {
    const { getAllRecords, saveRecord } = await import("./db.js");
    const allBookings = (await getAllRecords("booking_requests")) || [];
    const todayStr = new Date().toISOString().split("T")[0];

    let todaysBookings = allBookings.filter((b) => b.date === todayStr);
    todaysBookings.sort((a, b) => a.time.localeCompare(b.time));

    const formatTime12h = (t24) => {
      if (!t24) return "";
      const [h, m] = t24.split(":");
      const hour = parseInt(h);
      return `${ (hour % 12 || 12).toString().padStart(2, "0") }:${ m } ${ hour >= 12 ? "PM" : "AM" } `;
    };

    let bookingsHtml = "";
    if (todaysBookings.length === 0) {
      bookingsHtml =
        '<p class="text-muted" style="padding: 20px; text-align: center;">No bookings for today.</p>';
    } else {
      bookingsHtml = todaysBookings
        .map(
          (b) => `
  <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
    <div>
      <strong style="font-size: 16px; color: var(--text-primary);">
        ${formatTime12h(b.time)} – ${b.name} – ${b.treatment_type === "Online Consultation" ? "Online" : b.clinic}
      </strong>
      <div style="color: var(--text-secondary); font-size: 13px; margin-top: 6px;">
        ID: ${b.patient_id || "Unregistered"} | Phone: ${b.phone} | Status: <b style="color: ${b.status === " Pending" ? "var(--warning)" : b.status === "Confirmed" ? "var(--primary-color)" : b.status === "Completed" ? "var(--success)" : "var(--error)"}">${b.status}</b>
    </div>
                    </div>
  <div style="display: flex; gap: 8px;">
    ${b.status === "Pending" ? `<button class="primary-btn btn-sm" onclick="window.handleBookingAction('${b.id}', 'Confirm')" style="padding: 6px 12px; border-radius: 6px; font-size: 13px;"><i class="ph ph-check"></i> Confirm</button>` : ""}
    ${b.status === "Confirmed" ? `<button class="secondary-btn btn-sm" onclick="window.handleBookingAction('${b.id}', 'Complete')" style="border-color: var(--success); color: var(--success); padding: 6px 12px; border-radius: 6px; font-size: 13px;"><i class="ph ph-check-circle"></i> Complete</button>` : ""}
    ${b.status === "Confirmed" ? `<button class="icon-btn" onclick="window.handleBookingAction('${b.id}', 'No-Show')" title="Did Not Attend" style="color: var(--warning); border: 1px solid var(--warning-light); padding: 4px 8px; border-radius: var(--radius-sm);"><i class="ph ph-user-minus"></i></button>` : ""}
    ${["Pending", "Confirmed"].includes(b.status) ? `<button class="icon-btn" onclick="window.handleBookingAction('${b.id}', 'Cancel')" title="Cancel" style="color: var(--error); border: 1px solid var(--error-light); padding: 4px 8px; border-radius: var(--radius-sm);"><i class="ph ph-x"></i></button>` : ""}
  </div>
                </div>
  `,
        )
        .join("");
    }

    const baseUrl =
      window.location.origin +
      window.location.pathname.replace("index.html", "") +
      "pages/booking.html";
    const msgParams = encodeURIComponent(
      "Acu Shafi Clinic\n\nBook your appointment here:\n\n{LINK}\n\nPlease fill the form to confirm your appointment.",
    );

    const createLinkCard = (title, icon, link) => {
      const waLink = `https://wa.me/?text=${msgParams.replace("%7BLINK%7D", encodeURIComponent(link))}`;
return `
                <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                    <div style="flex: 1; overflow: hidden; margin-right: 15px;">
                        <strong style="font-size: 15px; display: flex; align-items: center; gap: 8px; color: var(--text-primary);">
                            <i class="${icon}" style="color: var(--primary-color);"></i> ${title}
                        </strong>
                        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace;">
                            ${link}
                        </div>
                    </div>
                    <div>
                        <a href="${waLink}" target="_blank" class="primary-btn btn-sm" style="background-color: #25D366; border-color: #25D366; padding: 8px 16px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="ph ph-whatsapp-logo"></i> Share
                        </a>
                    </div>
                </div>
            `;
    };

const bookingLinksHtml = `
            <div style="margin-top: 40px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-primary);">
                    <i class="ph ph-link" style="color: var(--primary-color); font-size: 24px;"></i> WhatsApp Booking Links
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    ${createLinkCard("General Booking Link", "ph ph-calendar-plus", baseUrl)}
                    ${createLinkCard("Parad Clinic Link", "ph ph-map-pin", baseUrl + "?clinic=parad")}
                    ${createLinkCard("Manantheri Clinic Link", "ph ph-map-pin", baseUrl + "?clinic=manantheri")}
                    ${createLinkCard("Online Consultation Link", "ph ph-video-camera", baseUrl + "?type=online")}
                </div>
            </div>
        `;

// [Phase-21] Booking Risk Monitor
const allNoShows = (await getAllRecords("no_show_records")) || [];
const riskPatients = allNoShows
  .filter((r) => r.no_show_count > 0)
  .sort((a, b) => b.no_show_count - a.no_show_count);

let riskMonitorHtml = "";
if (riskPatients.length === 0) {
  riskMonitorHtml =
    '<p class="text-muted" style="padding: 20px; text-align: center;">No risky patients detected.</p>';
} else {
  riskMonitorHtml = riskPatients
    .map(
      (r) => `
                <div style="background: var(--bg-primary); border: 1px solid ${r.block_status ? "rgba(220,38,38,0.3)" : "var(--border-color)"}; border-left: 4px solid ${r.block_status ? "var(--error)" : "var(--warning)"}; border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                    <div>
                        <strong style="font-size: 16px; color: ${r.block_status ? "var(--error)" : "var(--text-primary)"};">
                            ${r.name} 
                            ${r.block_status ? '<span class="badge badge-error ml-2">BLOCKED</span>' : ""}
                        </strong>
                        <div style="color: var(--text-secondary); font-size: 13px; margin-top: 6px;">
                            ID: ${r.patient_id || "Unregistered"} | Phone: ${r.phone} | <span style="color: var(--warning); font-weight: 500;">Missed: ${r.no_show_count} </span>
                            <br>
                            <span style="font-size: 11px; opacity: 0.8;">Last miss: ${new Date(r.last_no_show_date).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        ${r.block_status ? `<button class="primary-btn btn-sm" onclick="window.handleRiskAction('${r.id}', 'Unblock')" style="padding: 6px 12px; border-radius: 6px; font-size: 13px;"><i class="ph ph-shield-check"></i> Unblock</button>` : ""}
                        <button class="secondary-btn btn-sm" onclick="window.handleRiskAction('${r.id}', 'Reset')" style="padding: 6px 12px; border-radius: 6px; font-size: 13px;"><i class="ph ph-arrow-counter-clockwise"></i> Reset</button>
                    </div>
                </div>
            `,
    )
    .join("");
}

const riskSectionHtml = `
            <div style="margin-top: 40px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-primary);">
                    <i class="ph ph-warning-circle" style="color: var(--warning); font-size: 24px;"></i> Booking Risk Monitor
                </h3>
                ${riskMonitorHtml}
            </div>
        `;

// [Phase-22] Follow-Up Reminder Engine
const { getFollowUpData } = await import("./followup_engine.js");
let followUps = [];
try {
  const rawFollowUps = await getFollowUpData();
  followUps = Array.isArray(rawFollowUps) ? rawFollowUps : [];
} catch (e) {
  console.warn("FollowUp Engine failed gracefully", e);
}

let followUpHtml = "";
if (followUps.length === 0) {
  followUpHtml =
    '<p class="text-muted" style="padding: 20px; text-align: center;">No follow-ups pending.</p>';
} else {
  const createWaMsg = (name) => {
    const link =
      window.location.origin +
      window.location.pathname.replace("index.html", "") +
      "pages/booking.html";
    return encodeURIComponent(
      `Hello ${name},\n\nYour acupuncture follow-up session\nat Acu Shafi Clinic is due.\n\nPlease book your appointment.\n\nBooking Link:\n${link}`,
    );
  };

  followUpHtml = followUps
    .map(
      (f) => `
                <div class="followup-card level-${f.level}" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                    <div>
                        <strong style="font-size: 16px; color: var(--text-primary);">
                            ${f.name} <span class="badge ${f.level_class}" style="margin-left:8px; font-size:12px;">${f.level_display}</span>
                        </strong>
                        <div style="color: var(--text-secondary); font-size: 13px; margin-top: 6px;">
                            Phone: ${f.phone} | Last Visit: <b>${f.days_since} days ago</b> (${new Date(f.last_visit_date).toLocaleDateString()})<br>
                            Complaint: ${f.complaints || "Unspecified"}
                        </div>
                    </div>
                    <div>
                        <a href="https://wa.me/${f.phone.replace(/\\D/g, "")}?text=${createWaMsg(f.name)}" target="_blank" class="primary-btn btn-sm" style="background-color: #25D366; border-color: #25D366; padding: 6px 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-size: 13px;">
                            <i class="ph ph-whatsapp-logo"></i> Send Reminder
                        </a>
                    </div>
                </div>
            `,
    )
    .join("");
}

const followUpSectionHtml = `
            <div style="margin-top: 40px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px; color: var(--text-primary);">
                        <i class="ph ph-bell-ringing" style="color: var(--primary-color); font-size: 24px;"></i> Follow-Up Reminders
                    </h3>
                    <div class="followup-filters" style="display: flex; gap: 8px;">
                        <button class="btn-sm secondary-btn active-filter" data-level="all" style="padding: 4px 8px; font-size: 12px; border-radius: 4px;">All</button>
                        <button class="btn-sm secondary-btn" data-level="1" style="padding: 4px 8px; font-size: 12px; border-radius: 4px; border-color: #10b981; color: #10b981;">Level 1</button>
                        <button class="btn-sm secondary-btn" data-level="2" style="padding: 4px 8px; font-size: 12px; border-radius: 4px; border-color: #f59e0b; color: #f59e0b;">Level 2</button>
                        <button class="btn-sm secondary-btn" data-level="3" style="padding: 4px 8px; font-size: 12px; border-radius: 4px; border-color: #ef4444; color: #ef4444;">Level 3</button>
                    </div>
                </div>
                <div id="followupListContainer">
                    ${followUpHtml}
                </div>
            </div>
        `;

view.innerHTML = `
            <div class="dashboard-widgets" style="max-width: 800px; margin: 0 auto; padding-top: 20px;">
                <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-primary);">
                    <i class="ph ph-calendar-check" style="color: var(--primary-color); font-size: 24px;"></i> Today's Bookings
                </h3>
                ${bookingsHtml}
                
                ${bookingLinksHtml}

                ${followUpSectionHtml}
                
                ${riskSectionHtml}
            </div>
        `;

if (!window.handleBookingAction) {
  window.handleBookingAction = async (id, action) => {
    const { getAllRecords, saveRecord } = await import("./db.js");
    const b = (await getAllRecords("booking_requests")).find(
      (x) => x.id === id,
    );
    if (!b) return;

    if (action === "Confirm") {
      b.status = "Confirmed";

      // Auto Register Patient
      const patients = await getAllRecords("patients");
      let existingPatient = patients.find(
        (p) =>
          p.name.toLowerCase() === b.name.toLowerCase() &&
          p.age === b.age &&
          p.gender === b.gender &&
          p.location.toLowerCase() === b.location.toLowerCase(),
      );

      if (!existingPatient) {
        let highestId = 0;
        patients.forEach((p) => {
          if (p.id && p.id.startsWith("ACU-")) {
            const num = parseInt(p.id.replace("ACU-", ""));
            if (!isNaN(num) && num > highestId) highestId = num;
          }
        });
        const nextId = "ACU-" + String(highestId + 1).padStart(4, "0");

        existingPatient = {
          id: nextId,
          name: b.name,
          age: b.age,
          gender: b.gender,
          phone: b.phone,
          location: b.location,
        };
        await saveRecord("patients", existingPatient);

        // Show toast mapping logic via window
        const { showToast } = await import("./ui.js");
        if (showToast)
          showToast("New patient auto-registered: " + nextId, "success");
      }

      b.patient_id = existingPatient.id;
      await saveRecord("booking_requests", b);
    } else if (action === "Complete") {
      b.status = "Completed";
      await saveRecord("booking_requests", b);
    } else if (action === "No-Show") {
      if (
        confirm(
          "Mark this patient as Did Not Attend? This will increase their No-Show count.",
        )
      ) {
        b.status = "No-Show";
        await saveRecord("booking_requests", b);

        // [Phase-21] Update No-Show Records
        const noShowRecords = await getAllRecords("no_show_records");
        let patientRecord = noShowRecords.find((r) => r.phone === b.phone);

        if (!patientRecord) {
          patientRecord = {
            id: "ns_" + Date.now().toString(36),
            patient_id: b.patient_id,
            phone: b.phone,
            name: b.name,
            no_show_count: 0,
            warning_count: 0,
            block_status: false,
          };
        }

        patientRecord.no_show_count += 1;
        patientRecord.last_no_show_date = new Date().toISOString();

        if (patientRecord.no_show_count >= 3) {
          patientRecord.block_status = true;
        }

        await saveRecord("no_show_records", patientRecord);

        const { showToast } = await import("./ui.js");
        if (showToast) showToast("Patient marked as No-Show", "warning");
      } else {
        return;
      }
    } else if (action === "Cancel") {
      if (confirm("Are you sure you want to cancel this booking?")) {
        b.status = "Cancelled";
        await saveRecord("booking_requests", b);
      } else {
        return;
      }
    }

    renderDashboard();
  };
}

if (!window.handleRiskAction) {
  window.handleRiskAction = async (id, action) => {
    const { getAllRecords, saveRecord } = await import("./db.js");
    const noShowRecords = await getAllRecords("no_show_records");
    const rec = noShowRecords.find((x) => x.id === id);
    if (!rec) return;

    if (action === "Unblock") {
      rec.block_status = false;
      await saveRecord("no_show_records", rec);
    } else if (action === "Reset") {
      if (
        confirm(
          "Are you sure you want to reset the missed appointments counter to 0?",
        )
      ) {
        rec.block_status = false;
        rec.no_show_count = 0;
        await saveRecord("no_show_records", rec);
      }
    }

    renderDashboard();
  };
}

// Apply filters
setTimeout(() => {
  const filterBtns = document.querySelectorAll(".followup-filters button");
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // Update active state
      filterBtns.forEach((b) => {
        b.classList.remove("active-filter");
        b.style.fontWeight = "normal";
        b.style.opacity = "0.7";
      });
      e.target.classList.add("active-filter");
      e.target.style.fontWeight = "bold";
      e.target.style.opacity = "1";

      const level = e.target.dataset.level;
      const cards = document.querySelectorAll(".followup-card");
      cards.forEach((card) => {
        if (level === "all") {
          card.style.display = "flex";
        } else {
          if (card.classList.contains("level-" + level)) {
            card.style.display = "flex";
          } else {
            card.style.display = "none";
          }
        }
      });
    });
  });
  // trigger init styling
  document
    .querySelector('.followup-filters button[data-level="all"]')
    .click();
}, 100);
  } catch (e) {
    console.error("Dashboard render error:", e);
    // Safe fallback: if DB fails, still render empty dashboard
    view.innerHTML = `
      <div class="dashboard-widgets" style="max-width: 800px; margin: 0 auto; padding-top: 20px;">
          <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-primary);">
              <i class="ph ph-calendar-check" style="color: var(--primary-color); font-size: 24px;"></i> Today's Bookings
          </h3>
          <p class="text-muted" style="padding: 20px; text-align: center;">Database unavailable / Offline mode.</p>
      </div>
    `;
  }
};

// Start the application safely
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp);
} else {
  // If document is already loaded -> call bootApp() directly
  bootApp();
}

// --- PWA Support ---
let deferredPrompt;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const topbarActions = document.querySelector('.topbar-actions');
  if (topbarActions && !document.getElementById('installPwaBtn')) {
      topbarActions.insertAdjacentHTML('afterbegin', `
          <button class="primary-btn btn-sm pulse-glow" id="installPwaBtn" style="background-color: var(--success); border-color: var(--success);">
              <i class="ph ph-download-simple"></i> Install App
          </button>
      `);
      
      document.getElementById('installPwaBtn').addEventListener('click', async () => {
          if (deferredPrompt) {
              deferredPrompt.prompt();
              const { outcome } = await deferredPrompt.userChoice;
              if (outcome === 'accepted') {
                  document.getElementById('installPwaBtn').style.display = 'none';
                  import("./ui.js").then(({ showToast }) => showToast("App installed successfully!", "success"));
              }
              deferredPrompt = null;
          }
      });
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const btn = document.getElementById('installPwaBtn');
  if (btn) btn.style.display = 'none';
  console.log('PWA was installed');
});