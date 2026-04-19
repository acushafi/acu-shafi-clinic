/**
 * pulse_engine.js
 * Core engine for generating clinical intelligence from Pulse Element Diagnoses.
 * Phase-23
 */

import { getAllRecords } from './db.js';

export const getPulseHistory = async (patientId) => {
    try {
        const visits = await getAllRecords('visits');
        const patientVisits = visits
            .filter(v => v.patient_id === patientId && v.pulse_elements && v.pulse_elements.length > 0)
            .sort((a, b) => b.date - a.date);

        return patientVisits.map(v => ({
            date: v.date,
            elements: v.pulse_elements,
            points_used: v.points_used,
            outcome: v.patient_feedback
        }));
    } catch (e) {
        console.error("Phase-23 Pulse Engine Error:", e);
        return [];
    }
};

export const getPulseAnalytics = async () => {
    try {
        const visits = await getAllRecords('visits');

        const combinationMap = {};

        visits.forEach(v => {
            if (!v.pulse_elements || v.pulse_elements.length === 0) return;

            // Sort to ensure "Water + Earth" is same as "Earth + Water"
            const pattern = [...v.pulse_elements].sort().join(' + ');

            if (!combinationMap[pattern]) {
                combinationMap[pattern] = {
                    pattern,
                    totalCases: 0,
                    resolvedCases: 0,
                    pointsFreq: {}
                };
            }

            const stat = combinationMap[pattern];
            stat.totalCases++;

            if (v.patient_feedback === 'Resolved' || v.patient_feedback === 'Improved') {
                stat.resolvedCases++;

                if (v.points_used) {
                    const pts = v.points_used.split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
                    pts.forEach(p => {
                        stat.pointsFreq[p] = (stat.pointsFreq[p] || 0) + 1;
                    });
                }
            }
        });

        // Convert to array and calculate success logic
        const analyticsList = Object.values(combinationMap).map(stat => {
            const successRate = stat.totalCases > 0 ? Math.round((stat.resolvedCases / stat.totalCases) * 100) : 0;

            // Top 5 points
            const sortedPoints = Object.keys(stat.pointsFreq)
                .sort((a, b) => stat.pointsFreq[b] - stat.pointsFreq[a])
                .slice(0, 5);

            return {
                imbalance_pattern: stat.pattern,
                totalCases: stat.totalCases,
                successRate: successRate,
                bestPoints: sortedPoints
            };
        });

        // Sort by total cases descending
        analyticsList.sort((a, b) => b.totalCases - a.totalCases);

        return analyticsList;
    } catch (e) {
        console.error("Phase-23 Pulse Engine Analytics Error:", e);
        return [];
    }
};
