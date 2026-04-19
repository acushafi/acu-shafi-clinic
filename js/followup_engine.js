/**
 * followup_engine.js - Automatic Appointment Reminder System
 * Phase-22
 */

import { getAllRecords } from './db.js';

export const getFollowUpData = async () => {
    try {
        const patients = await getAllRecords('patients');
        const visits = await getAllRecords('visits');
        const complaints = await getAllRecords('complaints');

        const now = new Date();
        const followUps = [];

        for (const patient of patients) {
            // Get patient's visits, sorted by date descending
            const patientVisits = visits
                .filter(v => v.patient_id === patient.id && v.date)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            if (patientVisits.length === 0) continue; // No visits, no follow up

            const lastVisitDate = new Date(patientVisits[0].date);
            const _MS_PER_DAY = 1000 * 60 * 60 * 24;
            const daysSinceLastVisit = Math.floor((now - lastVisitDate) / _MS_PER_DAY);

            // Follow-up condition 1: > 7 days since last visit
            if (daysSinceLastVisit <= 7) continue;

            // Follow-up condition 2: Has active complaint
            const patientComplaints = complaints.filter(c => c.patient_id === patient.id);
            const activeComplaints = patientComplaints.filter(c => c.status === 'Active' || c.status === 'Recurred' || c.status === 'Same' || c.status === 'Worse' || !c.status); // Default to active if unknown

            // To support legacy logic where complaints might be in visits but not stored in complaints DB,
            // we will also check the last visit's complaint string if no complaints are found in the DB.
            let activeComplaintNames = activeComplaints.map(c => c.name);

            // If they have explicit "Resolved" or "Improved" complaints and no active ones, they are fine.
            const resolvedComplaints = patientComplaints.filter(c => c.status === 'Resolved' || c.status === 'Improved');

            if (activeComplaintNames.length === 0) {
                if (resolvedComplaints.length > 0) {
                    // All known complaints are resolved
                    continue;
                } else {
                    // Fallback to last visit complaint if DB has no lifecycle records for them
                    if (patientVisits[0].complaint) {
                        activeComplaintNames = [patientVisits[0].complaint];
                    } else {
                        continue; // No complaint to follow up on
                    }
                }
            }

            // Determine Level
            let levelDisplay = '';
            let levelClass = '';
            let levelInt = 0;

            if (daysSinceLastVisit >= 8 && daysSinceLastVisit <= 14) {
                levelDisplay = 'Gentle Reminder';
                levelClass = 'badge-success';
                levelInt = 1;
            } else if (daysSinceLastVisit >= 15 && daysSinceLastVisit <= 30) {
                levelDisplay = 'Follow-up Pending';
                levelClass = 'badge-warning';
                levelInt = 2;
            } else if (daysSinceLastVisit > 30) {
                levelDisplay = 'Treatment Gap Alert';
                levelClass = 'badge-error';
                levelInt = 3;
            }

            followUps.push({
                patient_id: patient.id,
                name: patient.name,
                phone: patient.phone,
                last_visit_date: patientVisits[0].date,
                days_since: daysSinceLastVisit,
                complaints: activeComplaintNames.join(', '),
                level_display: levelDisplay,
                level_class: levelClass,
                level: levelInt
            });
        }

        // Sort by longest gap first
        followUps.sort((a, b) => b.days_since - a.days_since);

        return followUps;

    } catch (e) {
        console.error("Phase-22 FollowUp Engine Error:", e);
        return [];
    }
};
