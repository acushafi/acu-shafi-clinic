/**
 * App State Management
 * Holds SaaS variables, current user state, and future multi-tenant context.
 */

export const appState = {
    // SaaS Future Variables
    tenantId: 'clinic_001', // Example: to support multi-clinic DB separation later
    tenantName: 'Shafi Acupuncture Clinic',
    subscriptionStatus: 'active',
    subscriptionPlan: 'free', // 'free', 'pro', 'enterprise'

    // Feature Flags (Easy toggle for future monetizable features)
    featureFlags: {
        enableElectroAcu: true, // Specific fields for electro-acupuncture
        enableAIReports: false,
        enableSMSreminders: false,
        enableVoiceRecording: true
    },

    // Sync status memory
    syncStatus: {
        isOnline: navigator.onLine,
        lastSync: null,
        pendingChanges: 0
    },

    // Session UI State
    ui: {
        theme: 'light',
        sidebarOpen: false
    }
};

// Initial listener for network status (Sync engine readiness)
window.addEventListener('online', () => { appState.syncStatus.isOnline = true; console.log("System Online"); });
window.addEventListener('offline', () => { appState.syncStatus.isOnline = false; console.log("System Offline"); });
