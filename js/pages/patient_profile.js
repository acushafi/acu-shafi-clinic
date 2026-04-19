import { getRecord, getAllRecords, saveRecord, deleteRecord } from '../db.js';
import { showToast, showModal } from '../ui.js';

export const renderPatientProfileView = async (container, patientId) => {
    if (!patientId) {
        container.innerHTML = '<h2>Error: No Patient ID</h2>';
        return;
    }

    container.innerHTML = `
        <div class="loading-state">
            <i class="ph ph-spinner-gap spin"></i>
            <p>Loading Patient Profile...</p>
        </div>
    `;

    try {
        const patient = await getRecord('patients', patientId);
        if (!patient) throw new Error('Patient not found');

        const allComplaints = await getAllRecords('complaints');
        const patientComplaints = allComplaints.filter(c => c.patient_id === patientId).sort((a, b) => b.updated_at - a.updated_at);

        const allVisits = await getAllRecords('visits');
        const patientVisits = allVisits.filter(v => v.patient_id === patientId).sort((a, b) => b.date - a.date);

        const allDocs = await getAllRecords('documents').catch(() => []);
        const patientDocs = allDocs.filter(d => d.patient_id === patientId && !d.is_deleted).sort((a, b) => (b.upload_date || b.created_at) - (a.upload_date || a.created_at));

        // [Phase-13A] Active Scheme Fetch logic
        const allPatientSchemes = await getAllRecords('patient_schemes');
        const activeScheme = allPatientSchemes.find(ps => ps.patient_id === patientId && ps.status === 'Active');
        let activeSchemeData = null;
        if (activeScheme) {
            activeSchemeData = await getRecord('schemes', activeScheme.scheme_id);
        }

        // [Phase-21] No-Show Risk logic
        const allNoShowRecords = await getAllRecords('no_show_records');
        const noShowRecord = allNoShowRecords.find(r => r.patient_id === patientId);

        // [Phase-22] Follow-Up Data
        const { getFollowUpData } = await import('../followup_engine.js');
        const followUps = await getFollowUpData();
        const myFollowUp = followUps.find(f => f.patient_id === patientId);

        // [Phase-23] Pulse History Data
        const { getPulseHistory } = await import('../pulse_engine.js');
        const pulseHistory = await getPulseHistory(patientId);

        const lastVisit = patientVisits.length > 0 ? patientVisits[0] : null;

        const activeComplaints = patientComplaints.filter(c => c.status === 'Active' || c.status === 'Recurred');
        const resolvedComplaints = patientComplaints.filter(c => c.status === 'Resolved');

        // --- Section 1: Patient Identity ---
        const identityHtml = `
            <div style="background: var(--bg-surface); padding: 20px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Patient ID</div>
                    <div style="font-weight: 600; font-size: 1.1rem; color: var(--brand-primary);">${escapeHtml(patient.patient_id || '-')}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Name</div>
                    <div style="font-weight: 600;">${escapeHtml(patient.name)}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Age</div>
                    <div style="font-weight: 600;">${patient.age || '-'}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Gender</div>
                    <div style="font-weight: 600;">${patient.gender || '-'}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Phone</div>
                    <div style="font-weight: 600;">${escapeHtml(patient.phone || '-')}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Location</div>
                    <div style="font-weight: 600;">${escapeHtml(patient.location || '-')}</div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">No-Show Risk</div>
                    <div style="font-weight: 600; margin-top: 2px;">
                        ${noShowRecord && noShowRecord.no_show_count > 0 ? `<span class="badge ${noShowRecord.block_status ? 'badge-error' : 'badge-warning'}">${noShowRecord.no_show_count} Missed</span>` : `<span class="badge badge-neutral">0 Missed</span>`}
                    </div>
                </div>
                <div>
                    <div style="font-size: 0.85rem; color: var(--text-tertiary);">Follow-up Status</div>
                    <div style="font-weight: 600; margin-top: 2px;">
                        ${myFollowUp ? `<span class="badge ${myFollowUp.level_class}">${myFollowUp.level_display} (${myFollowUp.days_since}d)</span>` : `<span class="badge badge-neutral">Up to date</span>`}
                    </div>
                </div>
            </div>
            
            ${noShowRecord && noShowRecord.no_show_count > 0 ? `
            <div style="background: var(--bg-surface); padding: 16px 20px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px; border: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                <div>
                    <strong style="color: ${noShowRecord.block_status ? 'var(--error)' : 'var(--warning)'}; display: flex; align-items: center; gap: 6px; font-size: 15px;"><i class="ph ph-warning-circle"></i> Booking Risk Detected</strong>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">This patient has missed ${noShowRecord.no_show_count} appointments. ${noShowRecord.block_status ? 'They are currently BLOCKED from booking.' : ''}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    ${noShowRecord.block_status ? `<button class="primary-btn btn-sm" id="btnUnblockPatient" data-id="${noShowRecord.id}" style="font-size: 13px; padding: 6px 12px; border-radius: 6px;"><i class="ph ph-shield-check"></i> Unblock Patient</button>` : ''}
                    <button class="secondary-btn btn-sm" id="btnResetNoShow" data-id="${noShowRecord.id}" style="font-size: 13px; padding: 6px 12px; border-radius: 6px;"><i class="ph ph-arrow-counter-clockwise"></i> Reset Counter</button>
                </div>
            </div>
            ` : ''}
        `;

        // --- Section 2: Disease Summary ---
        const renderStatusBadge = (status) => {
            if (status === 'Resolved') return `<span class="badge" style="background:#d1fae5; color:#065f46;">Resolved</span>`;
            if (status === 'Improved') return `<span class="badge" style="background:#dbeafe; color:#1e40af;">Improved</span>`;
            if (status === 'Same' || status === 'Active') return `<span class="badge badge-warning">${status}</span>`;
            if (status === 'Worse' || status === 'Recurred') return `<span class="badge" style="background:#fee2e2; color:#b91c1c;">${status}</span>`;
            return `<span class="badge badge-neutral">${status}</span>`;
        };

        const diseaseSummaryHtml = patientComplaints.length === 0
            ? `<p class="text-center text-tertiary" style="padding: 16px;">No recorded diseases.</p>`
            : patientComplaints.map(c => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color);">
                    <div style="font-weight: 600;">${escapeHtml(c.name)}</div>
                    <div>${renderStatusBadge(c.status)}</div>
                </div>
            `).join('');

        // --- Section 3: Visit Timeline ---
        const visitTimelineHtml = patientVisits.length === 0
            ? `<p class="text-center text-tertiary" style="padding: 16px;">No visits recorded.</p>`
            : patientVisits.map((v, i) => `
                <div style="padding: 12px 16px; border-left: 3px solid var(--brand-primary); margin-left: 16px; margin-bottom: 8px; background: var(--bg-surface-hover);">
                    <div style="font-weight: 600;">Visit ${patientVisits.length - i} &mdash; ${new Date(v.date).toLocaleDateString()}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">Treated: ${escapeHtml(v.complaint || '-')}</div>
                </div>
            `).join('');

        // --- Section 4: Treatment Points History ---
        let allPoints = [];
        patientVisits.forEach(v => {
            if (v.points_used) {
                const pts = v.points_used.split(',').map(p => p.trim().toUpperCase()).filter(p => p);
                allPoints = allPoints.concat(pts);
            }
            if (v.aspm_protocol) {
                ['root', 'system', 'symptom', 'immunity', 'waste'].forEach(k => {
                    if (v.aspm_protocol[k]) {
                        const pts = v.aspm_protocol[k].split(',').map(p => p.trim().toUpperCase()).filter(p => p);
                        allPoints = allPoints.concat(pts);
                    }
                });
            }
        });
        const uniquePoints = [...new Set(allPoints)];

        const treatmentPointsHtml = uniquePoints.length === 0
            ? `<p class="text-center text-tertiary" style="padding: 16px;">No points recorded.</p>`
            : `<div style="padding: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
                ${uniquePoints.map(p => `<span class="badge badge-neutral" style="font-size: 0.9rem; padding: 6px 12px;">${escapeHtml(p)}</span>`).join('')}
               </div>`;

        // --- Section 5: Outcome Tracking ---
        let outcomes = {
            'Resolved': 0,
            'Improved': 0,
            'Same': 0,
            'Worse': 0
        };
        patientVisits.forEach(v => {
            if (v.patient_feedback && outcomes[v.patient_feedback] !== undefined) {
                outcomes[v.patient_feedback]++;
            }
        });

        // --- Section 7: Pulse History (Phase-23) ---
        const pulseHistoryHtml = pulseHistory.length === 0
            ? `<p class="text-center text-tertiary" style="padding: 16px;">No pulse element data recorded yet.</p>`
            : pulseHistory.map((ph, i) => {
                const elementsHtml = ph.elements.map(e => `<span class="badge" style="background: rgba(139, 92, 246, 0.1); color: var(--brand-primary); font-size: 0.8rem;">${escapeHtml(e)}</span>`).join(' ');

                let outcomeHtml = '';
                if (ph.outcome) {
                    const color = (ph.outcome === 'Resolved' || ph.outcome === 'Improved') ? 'var(--success)' : 'var(--warning)';
                    outcomeHtml = `<span style="font-size: 0.8rem; color: ${color}; margin-left: 8px;">(${ph.outcome})</span>`;
                }

                return `
                <div style="padding: 12px 16px; border-left: 3px solid rgba(139, 92, 246, 0.4); margin-left: 16px; margin-bottom: 8px; background: var(--bg-surface-hover);">
                    <div style="font-weight: 600; display:flex; justify-content:space-between; align-items:center;">
                        <span>${new Date(ph.date).toLocaleDateString()}</span>
                        <span>${outcomeHtml}</span>
                    </div>
                    <div style="margin-top: 8px; display: flex; gap: 4px; flex-wrap: wrap;">
                        ${elementsHtml}
                    </div>
                </div>
            `;
            }).join('');

        const outcomeTrackingHtml = `
            <div style="display: flex; justify-content: space-around; padding: 16px; text-align: center;">
                <div><div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">${outcomes['Resolved']}</div><div style="font-size: 0.8rem; color: var(--text-tertiary);">Resolved</div></div>
                <div><div style="font-size: 1.5rem; font-weight: 700; color: #1e40af;">${outcomes['Improved']}</div><div style="font-size: 0.8rem; color: var(--text-tertiary);">Improved</div></div>
                <div><div style="font-size: 1.5rem; font-weight: 700; color: var(--warning);">${outcomes['Same']}</div><div style="font-size: 0.8rem; color: var(--text-tertiary);">Same</div></div>
                <div><div style="font-size: 1.5rem; font-weight: 700; color: var(--error);">${outcomes['Worse']}</div><div style="font-size: 0.8rem; color: var(--text-tertiary);">Worse</div></div>
            </div>
        `;

        container.innerHTML = `
            <div class="view-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <h3 style="margin-bottom: 0;">Patient Clinical Profile</h3>
                    <span class="badge badge-neutral" style="font-size: 0.85rem; padding: 4px 8px;">Documents (${patientDocs.length})</span>
                </div>
                <div class="view-actions">
                    <a href="#visits" class="btn-secondary"><i class="ph ph-calendar"></i> View All Visits</a>
                </div>
            </div>

            <!-- SECTION 1: Patient Identity -->
            ${identityHtml}

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
                <!-- Left Column -->
                <div>
                    <!-- SECTION 2: Disease Summary -->
                    <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                            <h4 style="font-size: 1.1rem;"><i class="ph ph-activity" style="color: var(--brand-primary);"></i> Disease Summary</h4>
                        </div>
                        <div>${diseaseSummaryHtml}</div>
                    </div>

                    <!-- SECTION 5: Outcome Tracking -->
                    <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                            <h4 style="font-size: 1.1rem;"><i class="ph ph-chart-line-up" style="color: var(--brand-primary);"></i> Outcome Tracking</h4>
                        </div>
                        <div>${outcomeTrackingHtml}</div>
                    </div>
                </div>

                <!-- Right Column -->
                <div>
                    <!-- SECTION 3: Visit Timeline -->
                    <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                            <h4 style="font-size: 1.1rem;"><i class="ph ph-clock-counter-clockwise" style="color: var(--brand-primary);"></i> Visit Timeline</h4>
                        </div>
                        <div style="padding-top: 16px; padding-bottom: 16px;">${visitTimelineHtml}</div>
                    </div>

                    <!-- [Phase-13A] SECTION 6: Patient Scheme -->
                    <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                            <h4 style="font-size: 1.1rem; margin: 0;"><i class="ph ph-package" style="color: var(--brand-primary);"></i> Active Treatment Scheme</h4>
                            ${!activeScheme ? `<button id="btnAssignScheme" class="btn-primary" style="font-size: 0.85rem; padding: 6px 12px;">Assign Scheme</button>` : ''}
                        </div>
                        <div style="padding: 16px;">
                            ${activeScheme ? `
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <h4 style="margin:0; font-size: 1.1rem; color: var(--text-primary);">${escapeHtml(activeSchemeData?.scheme_name || 'Unknown Scheme')} <span class="badge badge-warning" style="font-size: 0.75rem; margin-left: 8px;">Active</span></h4>
                                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px; text-align: center;">
                                        <div style="background: var(--bg-surface-hover); padding: 12px; border-radius: 8px;">
                                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${activeScheme.total_sessions}</div>
                                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Total</div>
                                        </div>
                                        <div style="background: rgba(220, 38, 38, 0.1); padding: 12px; border-radius: 8px;">
                                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--error);">${activeScheme.used_sessions}</div>
                                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Used</div>
                                        </div>
                                        <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 8px;">
                                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">${activeScheme.remaining_sessions}</div>
                                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Remaining</div>
                                        </div>
                                    </div>
                                    <button id="btnRemoveScheme" data-id="${activeScheme.id}" class="btn-secondary" style="margin-top: 12px; width: 100%; color: var(--error); border-color: var(--error);">Remove / Cancel Scheme</button>
                                </div>
                            ` : `
                                <p class="text-tertiary text-center" style="margin:0; padding: 16px 0;">No active scheme assigned to this patient.</p>
                            `}
                        </div>
                    </div>

                    <!-- SECTION 4: Treatment Points History -->
                    <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                            <h4 style="font-size: 1.1rem;"><i class="ph ph-push-pin" style="color: var(--brand-primary);"></i> Treatment Points History</h4>
                        </div>
                        <div>${treatmentPointsHtml}</div>
                    </div>

                    <!-- [Phase-23] SECTION 7: Pulse Diagnosis History -->
                    <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                        <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color);">
                            <h4 style="font-size: 1.1rem;"><i class="ph ph-activity" style="color: var(--brand-primary);"></i> Pulse Element History</h4>
                        </div>
                        <div style="padding-top: 16px; padding-bottom: 16px;">${pulseHistoryHtml}</div>
                    </div>
                </div>
            </div>

            <!-- SECTION 6: Documents -->
            <div style="background: var(--bg-surface); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); margin-bottom: 24px;">
                <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="font-size: 1.1rem; margin: 0;"><i class="ph ph-file-text" style="color: var(--brand-primary);"></i> Documents</h4>
                    <div>
                        <button id="btnUploadDoc" class="btn-primary" style="font-size: 0.9rem; padding: 6px 12px;"><i class="ph ph-upload"></i> Upload Document</button>
                        <input type="file" id="docFileInput" style="display: none;" accept=".pdf,.jpg,.jpeg,.png,.webp">
                    </div>
                </div>
                <div style="padding: 16px;">
                    ${patientDocs.length === 0 ? `<p class="text-center text-tertiary" style="margin: 0;">No documents uploaded.</p>` : `
                        <div class="table-responsive">
                            <table class="data-table" style="width: 100%; text-align: left; border-collapse: collapse;">
                                <thead>
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <th style="padding: 12px 8px;">File Name</th>
                                        <th style="padding: 12px 8px;">File Type</th>
                                        <th style="padding: 12px 8px;">Upload Date</th>
                                        <th style="padding: 12px 8px; text-align: right;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${patientDocs.map(doc => `
                                        <tr style="border-bottom: 1px solid var(--border-color); background: var(--bg-surface);">
                                            <td style="padding: 12px 8px; font-weight: 500;">${escapeHtml(doc.file_name)}</td>
                                            <td style="padding: 12px 8px;">
                                                <span class="badge badge-neutral">${escapeHtml((doc.file_type || '').split('/')[1] || doc.file_type).toUpperCase()}</span>
                                            </td>
                                            <td style="padding: 12px 8px; color: var(--text-secondary);">
                                                ${new Date(doc.upload_date || doc.created_at).toLocaleDateString()}
                                            </td>
                                            <td style="padding: 12px 8px; text-align: right; white-space: nowrap;">
                                                <button class="btn-icon view-doc-btn" data-id="${doc.id}" title="View" style="color: var(--brand-primary); margin-right: 8px;"><i class="ph ph-eye" style="font-size: 1.2rem;"></i></button>
                                                <button class="btn-icon download-doc-btn" data-id="${doc.id}" title="Download" style="color: var(--success); margin-right: 8px;"><i class="ph ph-download-simple" style="font-size: 1.2rem;"></i></button>
                                                <button class="btn-icon delete-doc-btn" data-id="${doc.id}" data-name="${escapeHtml(doc.file_name)}" title="Delete" style="color: var(--error);"><i class="ph ph-trash" style="font-size: 1.2rem;"></i></button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;

        setTimeout(() => {
            // Document Upload Logic
            const uploadBtn = container.querySelector('#btnUploadDoc');
            if (uploadBtn) {
                uploadBtn.addEventListener('click', () => container.querySelector('#docFileInput').click());
            }

            // [Phase-21] Fake Booking Action Logic
            const unblockBtn = container.querySelector('#btnUnblockPatient');
            if (unblockBtn) {
                unblockBtn.addEventListener('click', async (e) => {
                    const nsId = e.target.closest('button').dataset.id;
                    const rec = await getRecord('no_show_records', nsId);
                    if (rec) {
                        rec.block_status = false;
                        await saveRecord('no_show_records', rec);
                        showToast('Patient unblocked successfully', 'success');
                        renderPatientProfileView(container, patientId);
                    }
                });
            }

            const resetBtn = container.querySelector('#btnResetNoShow');
            if (resetBtn) {
                resetBtn.addEventListener('click', async (e) => {
                    if (confirm('Are you sure you want to reset the missed appointments counter to 0?')) {
                        const nsId = e.target.closest('button').dataset.id;
                        const rec = await getRecord('no_show_records', nsId);
                        if (rec) {
                            rec.block_status = false;
                            rec.no_show_count = 0;
                            await saveRecord('no_show_records', rec);
                            showToast('No-Show counter reset to 0.', 'success');
                            renderPatientProfileView(container, patientId);
                        }
                    }
                });
            }

            const fileInput = container.querySelector('#docFileInput');
            if (fileInput) {
                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
                    if (!allowedTypes.includes(file.type)) {
                        showToast('Invalid file type. Only PDF, JPG, PNG, WEBP allowed.', 'error');
                        return;
                    }

                    if (file.size > 10 * 1024 * 1024) {
                        showToast('File too large. Maximum size is 10 MB.', 'error');
                        return;
                    }

                    showToast('Reading file data...', 'info');
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const base64Data = event.target.result;
                        const newDoc = {
                            patient_id: patientId,
                            file_name: file.name,
                            file_type: file.type,
                            file_size: file.size,
                            upload_date: Date.now(),
                            file_data: base64Data
                        };

                        try {
                            await saveRecord('documents', newDoc);
                            showToast('Document uploaded successfully!', 'success');
                            renderPatientProfileView(container, patientId);
                        } catch (err) {
                            console.error('Upload Error:', err);
                            showToast('Failed to save document.', 'error');
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }

            // Document actions logic
            // ... [Retained below]

            // [Phase-13A] Assign Scheme Logic
            const assignBtn = container.querySelector('#btnAssignScheme');
            if (assignBtn) {
                assignBtn.addEventListener('click', async () => {
                    const allSchemes = await getAllRecords('schemes');
                    if (allSchemes.length === 0) {
                        showToast('No schemas available. Please create one in Schemes Management.', 'warning');
                        window.location.hash = 'schemes';
                        return;
                    }

                    const schemeOptions = allSchemes.map(s => `<option value="${s.id}">${escapeHtml(s.scheme_name)} (Total: ${s.total_sessions} | ₹${s.price})</option>`).join('');

                    const modalHtml = `
                        <div class="form-group">
                            <label>Select Scheme to Assign</label>
                            <select id="sel_assign_scheme" class="form-control">
                                ${schemeOptions}
                            </select>
                        </div>
                    `;

                    showModal('Assign Treatment Scheme', modalHtml, async () => {
                        const schemeId = document.getElementById('sel_assign_scheme').value;
                        if (!schemeId) return false;

                        const selectedScheme = allSchemes.find(s => s.id === schemeId);
                        if (!selectedScheme) return false;

                        const psRecord = {
                            patient_id: patientId,
                            scheme_id: schemeId,
                            start_date: Date.now(),
                            total_sessions: selectedScheme.total_sessions,
                            used_sessions: 0,
                            remaining_sessions: selectedScheme.total_sessions,
                            status: 'Active'
                        };

                        await saveRecord('patient_schemes', psRecord);
                        showToast('Scheme assigned effectively', 'success');
                        renderPatientProfileView(container, patientId);
                        return true;
                    });
                });
            }

            const removeSchemeBtn = container.querySelector('#btnRemoveScheme');
            if (removeSchemeBtn) {
                removeSchemeBtn.addEventListener('click', async (e) => {
                    const psId = e.target.dataset.id;
                    if (confirm("Are you sure you want to cancel this scheme? Sessions cannot be restored.")) {
                        await deleteRecord('patient_schemes', psId);
                        showToast('Scheme cancelled', 'success');
                        renderPatientProfileView(container, patientId);
                    }
                });
            }

            container.querySelectorAll('.view-doc-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const doc = await getRecord('documents', id);
                    if (!doc) {
                        showToast('Document not found.', 'error');
                        return;
                    }

                    let previewHtml = '';
                    if (doc.file_type === 'application/pdf') {
                        previewHtml = `<iframe src="${doc.file_data}" width="100%" height="600px" style="border: none;"></iframe>`;
                    } else if (doc.file_type.startsWith('image/')) {
                        previewHtml = `<img src="${doc.file_data}" style="max-width: 100%; max-height: 70vh; display: block; margin: 0 auto; object-fit: contain;">`;
                    } else {
                        previewHtml = `<p class="text-center" style="padding: 32px;">Preview not available. Please download.</p>`;
                    }

                    showModal(doc.file_name, previewHtml);
                });
            });

            container.querySelectorAll('.download-doc-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const doc = await getRecord('documents', id);
                    if (!doc) return;

                    const a = document.createElement('a');
                    a.href = doc.file_data;
                    a.download = doc.file_name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
            });

            container.querySelectorAll('.delete-doc-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const name = e.currentTarget.dataset.name;
                    if (confirm(`Delete this document?\n\n"${name}"`)) {
                        try {
                            await deleteRecord('documents', id);
                            showToast('Document deleted.', 'success');
                            renderPatientProfileView(container, patientId);
                        } catch (err) {
                            showToast('Failed to delete document.', 'error');
                        }
                    }
                });
            });
        }, 0);

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="error-text" style="padding: 32px; text-align: center;">Failed to load patient profile data.</div>`;
    }
};

const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return (unsafe || "").toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};
