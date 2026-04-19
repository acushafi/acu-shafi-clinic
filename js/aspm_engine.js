// Phase-15: ASPM Treatment Intelligence Engine
import { AnalyticsEngine } from './treatment_analytics.js';

/**
 * Structured Symptom-to-Point Mapping for ASPM Method
 * Fallback values are provided if exact match is not found.
 */
const ASPM_SYMPTOM_LIBRARY = {
    // Neurological / Head
    "migraine": { root: "LV3, K3", activation: "LI4", symptom: "GB20, Taiyang", immunity: "ST36", waste: "UB67" },
    "headache": { root: "LV3, K3", activation: "LI4", symptom: "GB20, DU20", immunity: "ST36", waste: "UB67" },
    "insomnia": { root: "HT7, K3", activation: "PC6", symptom: "Anmian, DU20", immunity: "ST36", waste: "UB67" },

    // Musculoskeletal / Pain
    "lower back pain": { root: "K3", activation: "BL40", symptom: "BL23, BL25", immunity: "ST36", waste: "UB67" },
    "neck pain": { root: "K3", activation: "LI4", symptom: "GB20, SI3", immunity: "ST36", waste: "UB67" },
    "knee pain": { root: "K3", activation: "GB34", symptom: "ST35, Xiyan", immunity: "ST36", waste: "UB67" },
    "shoulder pain": { root: "K3", activation: "LI4", symptom: "LI15, SJ14", immunity: "ST36", waste: "UB67" },
    "sciatica": { root: "K3", activation: "GB30", symptom: "BL40, GB34", immunity: "ST36", waste: "UB67" },

    // Respiratory
    "asthma": { root: "LU9, K3", activation: "PC6", symptom: "LU7, CV22", immunity: "ST36", waste: "UB67" },
    "cough": { root: "LU9", activation: "LI4", symptom: "LU7, CV22", immunity: "ST36", waste: "UB67" },
    "allergies": { root: "LU9, SP3", activation: "LI4", symptom: "LI20, Yintang", immunity: "ST36", waste: "UB67" },

    // Digestive
    "acid reflux": { root: "PC6, SP4", activation: "PC6", symptom: "CV12, ST36", immunity: "LI11", waste: "ST44" },
    "gastritis": { root: "SP3, ST36", activation: "PC6", symptom: "CV12, ST25", immunity: "LI11", waste: "ST44" },
    "constipation": { root: "SP3, ST36", activation: "SJ6", symptom: "ST25, BL25", immunity: "LI11", waste: "ST44" },
    "diarrhea": { root: "SP3", activation: "ST36", symptom: "ST25, CV6", immunity: "LI11", waste: "ST44" },
    "bloating": { root: "SP3", activation: "PC6", symptom: "CV12, ST25", immunity: "ST36", waste: "ST44" },

    // Gynecological
    "pcos": { root: "SP6, K3", activation: "PC6", symptom: "CV4, Zigong", immunity: "ST36", waste: "UB67" },
    "irregular period": { root: "SP6, LV3", activation: "PC6", symptom: "CV4, CV6", immunity: "ST36", waste: "UB67" },
    "dysmenorrhea": { root: "SP6, LV3", activation: "LI4", symptom: "CV4, Zigong", immunity: "ST36", waste: "UB67" },

    // Systemic / General
    "fatigue": { root: "K3, SP3", activation: "PC6", symptom: "DU20, CV6", immunity: "ST36", waste: "UB67" },
    "hypertension": { root: "LV3, K3", activation: "PC6", symptom: "LI11, ST36", immunity: "ST36", waste: "UB67" },
    "diabetes": { root: "SP3, K3", activation: "PC6", symptom: "Weiwanxiashu", immunity: "ST36", waste: "UB67" }
};

/**
 * Intelligent fallback generator based on symptom keywords
 * @param {string} symptomText - The user-entered complaint text
 * @returns {object} ASPM object
 */
function heuristicASPM(symptomText) {
    const text = (symptomText || '').toLowerCase();

    // Default Fallback ASPM
    let result = {
        root: "KI3",
        activation: "ST36",
        symptom: "",
        immunity: "LI11",
        waste: "UB67"
    };

    // Keyword matching for symptom and specific root/activation overrides
    if (text.includes('pain') || text.includes('ache')) {
        result.symptom = "LI4, GB34, UB60, BL40";
        if (text.includes('back')) result.activation = 'BL40';
        if (text.includes('knee')) result.activation = 'GB34';
        if (text.includes('neck')) result.activation = 'LI4';
    }
    else if (text.includes('nerve') || text.includes('tingling') || text.includes('numb')) {
        result.symptom = "SP6, KI3, LI4, GB34";
    }
    else if (text.includes('varicose') || text.includes('swelling') || text.includes('edema')) {
        result.symptom = "SP6, SP9, SP10, BL57";
        result.root = "SP3, KI3";
    }
    else if (text.includes('respiratory') || text.includes('breath') || text.includes('cough') || text.includes('asthma') || text.includes('allergy')) {
        result.symptom = "LU7, ST40, CV22, LI20";
        result.root = "LU9, KI3";
        result.activation = "LI4";
    }
    else if (text.includes('digestive') || text.includes('stomach') || text.includes('acid') || text.includes('gas') || text.includes('bloat') || text.includes('ulcer') || text.includes('gerd')) {
        result.symptom = "ST25, ST37, SP9, CV12";
        result.root = "SP3";
        result.activation = "PC6";
    }
    else if (text.includes('hormon') || text.includes('uterus') || text.includes('period') || text.includes('pcos') || text.includes('menstrua') || text.includes('fertility')) {
        result.symptom = "SP6, LR3, KI3, CV4";
        result.root = "SP6, KI3";
    }
    else if (text.includes('head') || text.includes('eye') || text.includes('migraine') || text.includes('vision') || text.includes('blur')) {
        result.symptom = "BL2, GB20, DU20, LI4";
        result.root = "LV3, KI3";
    }
    else {
        result.symptom = "LI4, ST36"; // generic fallback
    }

    return result;
}

/**
 * Generates an ASPM treatment protocol based on the provided symptom.
 * Integrating Phase-16 Analytics to prioritize historically successful points.
 * @param {string} symptom - The patient's chief complaint
 * @returns {Promise<object>} Struct containing root, activation, symptom, immunity, waste points
 */
export async function generateASPM(symptom) {
    if (!symptom || typeof symptom !== 'string') {
        return heuristicASPM('');
    }

    const normalizedSymptom = symptom.trim().toLowerCase();

    // Check Phase-16 Analytics for top performing points for this specific disease
    let topPoints = [];
    try {
        topPoints = await AnalyticsEngine.getBestPointsForDisease(normalizedSymptom);
    } catch (e) {
        console.warn("Analytics Engine lookup failed during ASPM generation", e);
    }

    let protocol = null;

    // 1. Exact Match via Library
    if (ASPM_SYMPTOM_LIBRARY[normalizedSymptom]) {
        protocol = { ...ASPM_SYMPTOM_LIBRARY[normalizedSymptom] };
    }

    // 2. Contains Match via Library (e.g., "Left Migraine" matches "migraine")
    if (!protocol) {
        for (const key in ASPM_SYMPTOM_LIBRARY) {
            if (normalizedSymptom.includes(key)) {
                protocol = { ...ASPM_SYMPTOM_LIBRARY[key] };
                break;
            }
        }
    }

    // 3. Fallback Heuristics
    if (!protocol) {
        protocol = heuristicASPM(normalizedSymptom);
    }

    // 4. Integrate Analytics (Prioritize Best Points)
    if (topPoints && topPoints.length > 0) {
        // If we have successful historical data, inject the top 2 points into the symptom string
        // Make sure we don't duplicate existing points
        const existingSymptomPts = protocol.symptom.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const newPtsToAdd = topPoints.filter(p => !existingSymptomPts.includes(p.toUpperCase())).slice(0, 2);

        if (newPtsToAdd.length > 0) {
            // Prepend the new points so they show up first
            protocol.symptom = [...newPtsToAdd, ...existingSymptomPts].join(', ');
        }
    }

    return protocol;
}
