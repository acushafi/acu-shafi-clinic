import { getAllRecords } from './db.js';

/**
 * Phase-16: Treatment Success Analytics Engine
 * Studies past treatment outcomes and identifies the most 
 * successful acupuncture points for each disease.
 */

export const AnalyticsEngine = {

    /**
     * Fetches raw outcome records and aggregates success metrics per disease.
     * @returns {Promise<Array>} List of analytics objects sorted by success rate / cases.
     */
    async getAnalyticsOverview() {
        try {
            const allOutcomes = await getAllRecords('outcome_records');
            const diseaseMap = new Map();

            allOutcomes.forEach(record => {
                const dName = (record.disease || '').trim().toUpperCase();
                if (!dName) return;

                if (!diseaseMap.has(dName)) {
                    diseaseMap.set(dName, {
                        disease: dName,
                        totalCases: 0,
                        resolvedCases: 0,
                        improvedCases: 0,
                        sameCases: 0,
                        worseCases: 0,
                        pointsFreq: {}   // track { "LI4": 12, "GB20": 5 } for resolved/improved cases
                    });
                }

                const dData = diseaseMap.get(dName);
                dData.totalCases++;

                const outcome = (record.outcome || '').toLowerCase();
                const isSuccess = outcome.includes('resolved') || outcome.includes('improved');

                if (outcome.includes('resolved')) dData.resolvedCases++;
                else if (outcome.includes('improved')) dData.improvedCases++;
                else if (outcome.includes('worse')) dData.worseCases++;
                else dData.sameCases++;

                // Track successful points
                if (isSuccess && Array.isArray(record.points_used)) {
                    record.points_used.forEach(p => {
                        const pt = p.trim().toUpperCase();
                        if (pt && !pt.includes('SELECT POINTS')) {
                            dData.pointsFreq[pt] = (dData.pointsFreq[pt] || 0) + 1;
                        }
                    });
                }
            });

            const analytics = Array.from(diseaseMap.values()).map(d => {
                // Determine top points
                const sortedPoints = Object.entries(d.pointsFreq)
                    .sort((a, b) => b[1] - a[1]) // highest frequency first
                    .map(entry => entry[0]);

                // Calculate success rate mostly based on Resolved and Improved
                // For Phase-16 requirements, user wants Resolved / Total Cases * 100 specifically.
                // We will calculate exact resolved rate, but also track improved for context.
                const successRate = d.totalCases > 0 ? Math.round((d.resolvedCases / d.totalCases) * 100) : 0;

                return {
                    disease: d.disease,
                    totalCases: d.totalCases,
                    resolvedCases: d.resolvedCases,
                    successRate: successRate,
                    bestPoints: sortedPoints.slice(0, 5) // Top 5
                };
            });

            // Sort: highest total cases first, then highest success rate
            analytics.sort((a, b) => {
                if (b.totalCases !== a.totalCases) return b.totalCases - a.totalCases;
                return b.successRate - a.successRate;
            });

            return analytics;

        } catch (err) {
            console.error("Failed to compile analytics overview:", err);
            return [];
        }
    },

    /**
     * Gets the best performing points for a specific disease.
     * @param {string} diseaseName 
     * @returns {Promise<Array>} Array of top points e.g. ["GB20", "LI4"]
     */
    async getBestPointsForDisease(diseaseName) {
        if (!diseaseName) return [];
        const dNameUpper = diseaseName.trim().toUpperCase();

        try {
            // First check the Phase-9 Disease Intelligence directly as it's cached.
            // But for Phase-16, rebuilding from raw outcome_records ensures real-time accuracy.
            const allOutcomes = await getAllRecords('outcome_records');
            const diseaseOutcomes = allOutcomes.filter(o => (o.disease || '').toUpperCase() === dNameUpper);

            const resolvedCases = diseaseOutcomes.filter(o => {
                const ot = (o.outcome || '').toLowerCase();
                return ot.includes('resolved') || ot.includes('improved');
            });

            const pointFreq = {};
            resolvedCases.forEach(o => {
                if (Array.isArray(o.points_used)) {
                    o.points_used.forEach(p => {
                        const pt = p.trim().toUpperCase();
                        if (pt && !pt.includes('SELECT POINTS')) {
                            pointFreq[pt] = (pointFreq[pt] || 0) + 1;
                        }
                    });
                }
            });

            return Object.entries(pointFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(entry => entry[0]);

        } catch (err) {
            console.error("Failed to get best points for disease:", err);
            return [];
        }
    },

    /**
     * Fetches and ranks Element Protocol Memory records
     * @returns {Promise<Array>} List of element protocols
     */
    async getElementProtocolsOverview() {
        try {
            const allProtocols = await getAllRecords('element_protocol_memory');

            const enriched = allProtocols.map(p => {
                const uCount = p.usage_count || 0;
                const sCount = p.success_count || 0;
                const rate = uCount > 0 ? Math.round((sCount / uCount) * 100) : 0;

                return {
                    ...p,
                    calcSuccessRate: rate
                };
            });

            // Sort highest usage first, then highest rate
            enriched.sort((a, b) => {
                if (b.usage_count !== a.usage_count) return (b.usage_count || 0) - (a.usage_count || 0);
                return b.calcSuccessRate - a.calcSuccessRate;
            });

            return enriched;
        } catch (e) {
            console.error("Failed to fetch element protocols for analytics:", e);
            return [];
        }
    }
};
