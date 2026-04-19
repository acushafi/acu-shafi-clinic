/**
 * db.js - IndexedDB wrapper
 * Restored for fully offline, pure local storage capability.
 */

import { appState } from "./store.js";
import { AcuClinicSeedLibrary } from "./seed_library.js";

const DB_NAME = "AcuClinicDB";
const DB_VERSION = 17;

export const STORES = [
    "patients", "visits", "booking_requests", "users", "no_show_records",
    "schemes", "payments", "expenses", "expense_categories",
    "clinic_sessions", "session_allocations", "disease_library",
    "inventory", "settings", "backup_logs", "auth_logs", "doctors",
    "system_config", "smart_points", "complaints", "masters", "treatment_analytics", "scheme_sessions", "patient_schemes"
];

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

export const getCurrentActiveUserId = () => localStorage.getItem("session_user") || null;
export const getCurrentActiveUserRole = () => localStorage.getItem("session_role") || "admin";

export const initDB = () => {
    return new Promise((resolve, reject) => {
        const fallbackId = setTimeout(() => resolve(true), 2000);
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            STORES.forEach(store => {
                if (!db.objectStoreNames.contains(store)) {
                    db.createObjectStore(store, { keyPath: "id" });
                }
            });
        };

        request.onblocked = () => {
            clearTimeout(fallbackId);
            resolve(true);
        };

        request.onsuccess = (event) => {
            clearTimeout(fallbackId);
            resolve(true);
        };

        request.onerror = (event) => {
            clearTimeout(fallbackId);
            console.error("Database error: ", event.target.error);
            resolve(true); 
        };
    });
};

const dbOp = (storeName, mode, operation) => {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => resolve(null), 2000);
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onblocked = () => {
            clearTimeout(timeoutId);
            resolve(null);
        };
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                clearTimeout(timeoutId);
                resolve(null);
                return;
            }
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const req = operation(store);

            req.onsuccess = () => {
                clearTimeout(timeoutId);
                resolve(req.result);
            };
            req.onerror = () => {
                clearTimeout(timeoutId);
                resolve(null); // Bypass instead of reject
            };
        };
        request.onerror = () => {
            clearTimeout(timeoutId);
            resolve(null);
        };
    });
};

const prepareRecord = (record, isNew = true) => {
    const now = Date.now();
    const result = { ...record };

    if (isNew) {
        result.id = record.id || generateId();
        result.created_at = now;
        result.is_deleted = false;
        result.version = 1;
    } else {
        result.version = (result.version || 1) + 1;
    }

    result.updated_at = now;
    result.last_modified = now;

    if (appState && appState.tenantId) {
        result.tenant_id = appState.tenantId;
    }
    
    const role = getCurrentActiveUserRole();
    const userId = getCurrentActiveUserId();
    
    if (role !== "admin" && userId) {
        if (!result.doctor_id) {
            result.doctor_id = userId;
        }
    }

    return result;
};

export const getRecord = async (storeName, id) => {
    try {
        const data = await dbOp(storeName, "readonly", (store) => store.get(id));
        if (data && !data.is_deleted) return data;
        return null;
    } catch(e) {
        console.error(e);
        return null;
    }
};

export const getAllRecords = async (storeName, includeDeleted = false) => {
    try {
        let records = await dbOp(storeName, "readonly", (store) => store.getAll());
        if (!records) records = [];
        
        if (!includeDeleted) {
            records = records.filter(r => !r.is_deleted);
        }

        const role = getCurrentActiveUserRole();
        const activeDoctor = getCurrentActiveUserId();
        
        if (role !== "admin" && activeDoctor) {
            records = records.filter(r => !r.doctor_id || r.doctor_id === activeDoctor);
        }

        records.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        return records;
    } catch(e) {
        console.error(e);
        return [];
    }
};

export const saveRecord = async (storeName, record) => {
    try {
        const existing = await getRecord(storeName, record.id);
        const prepared = prepareRecord({ ...existing, ...record }, !existing);
        
        await dbOp(storeName, "readwrite", (store) => store.put(prepared));
        return prepared;
    } catch (e) {
        console.error(e);
        throw e;
    }
};

export const deleteRecord = async (storeName, id) => {
    try {
        const existing = await getRecord(storeName, id);
        if (!existing) return false;
        
        existing.is_deleted = true;
        const prepared = prepareRecord(existing, false);
        
        await dbOp(storeName, "readwrite", (store) => store.put(prepared));
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

export const clearStore = async (storeName) => {
    try {
        await dbOp(storeName, "readwrite", (store) => store.clear());
        return true;
    } catch(e) { return false; }
};

export const getVisitsForPatient = async (patientId) => {
    const allVisits = await getAllRecords("visits");
    return allVisits.filter((v) => v.patient_id === patientId).sort((a, b) => b.date - a.date);
};

export const getPaymentsForPatient = async (patientId) => {
    const allPayments = await getAllRecords("payments");
    return allPayments.filter((p) => p.patient_id === patientId).sort((a, b) => b.date - a.date);
};

export const injectDiseaseSeedLibrary = async () => {
    try {
        const diseases = await getAllRecords("disease_library");
        if (diseases.length === 0) {
            for (const disease of AcuClinicSeedLibrary) {
                await saveRecord("disease_library", disease);
            }
        }
    } catch (e) {}
};

export const migrateAirToMetal = async () => Promise.resolve();
export const injectAuthSeedData = async () => {
    try {
        const doctors = await getAllRecords("doctors");
        if (doctors.length === 0) {
            const passHash = await hashPassword("1234");
            const adminDoc = {
                id: "DOC-0001",
                username: "shafi",
                name: "Dr. Shafi",
                role: "admin",
                password_hash: passHash
            };
            await saveRecord("doctors", adminDoc);
            console.log("Default admin account created: shafi / 1234");
        }
    } catch (e) {
        console.error("Failed to inject auth seed data:", e);
    }
};

export const hashPassword = async (password) => {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const migrateToMultiDoctor = async () => Promise.resolve();
