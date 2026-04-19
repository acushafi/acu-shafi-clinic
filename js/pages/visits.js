import { getAllRecords, saveRecord, deleteRecord, getRecord } from '../db.js';
import { showToast, showModal } from '../ui.js';
import { appState } from '../store.js';
import { initPointAutocomplete, initDynamicPointAutocomplete } from '../smart_points.js';
import { generateASPM } from '../aspm_engine.js';

let mediaRecorder = null;
let audioChunks = [];
let audioBlobState = null;
let recordingInterval = null;

export const renderVisitsView = async (container) => {
    container.innerHTML = `
        <div class="view-header">
            <h3>Clinical Visits</h3>
            <div class="view-actions">
                <div class="search-box">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" id="visitSearchInput" placeholder="Search by patient name...">
                </div>
                <button class="primary-btn" id="addVisitBtn"><i class="ph ph-plus"></i> Log Visit</button>
            </div>
        </div>
        <div class="table-container">
            <table class="data-table" id="visitsTable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Patient</th>
                        <th>Complaint</th>
                        <th>Points Used</th>
                        <th>Next Follow-up</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="visitsListBody">
                    <tr><td colspan="6" class="text-center"><i class="ph ph-spinner spin"></i> Loading visits...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('addVisitBtn').addEventListener('click', () => openVisitModal());
    document.getElementById('visitSearchInput').addEventListener('input', (e) => loadVisits(e.target.value));

    await loadVisits();
};

const loadVisits = async (searchQuery = '') => {
    const tbody = document.getElementById('visitsListBody');
    if (!tbody) return;

    try {
        const visits = await getAllRecords('visits');
        const patients = await getAllRecords('patients');
        const patientMap = patients.reduce((acc, p) => ({ ...acc, [p.id]: p.patient_id ? `[${p.patient_id}] ${p.name}` : p.name }), {});

        let filtered = visits;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = visits.filter(v => {
                const pName = patientMap[v.patient_id] || 'Unknown';
                return pName.toLowerCase().includes(q) || (v.complaint && v.complaint.toLowerCase().includes(q));
            });
        }

        // Sort by date DESC
        filtered.sort((a, b) => b.date - a.date);

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            safeInsertHTML(tbody, `<tr><td colspan="6" class="text-center empty-state"><p>No visits found.</p></td></tr>`);
            return;
        }

        tbody.innerHTML = '';
        safeInsertHTML(tbody, filtered.map(v => `
            <tr>
                <td><strong>${new Date(v.date).toLocaleDateString()}</strong></td>
                <td>${escapeHtml(patientMap[v.patient_id] || 'Unknown Patient')}</td>
                <td>
                    ${escapeHtml(v.complaint || '-')}
                    ${v.additional_complaints && v.additional_complaints.length > 0 ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">+ ${v.additional_complaints.map(escapeHtml).join(', ')}</div>` : ''}
                    ${v.followups ? v.followups.map(f => `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">↳ ${escapeHtml(f.name)}: ${f.status === 'improving' ? `Improving (${f.improvement_percent || 0}%)` : (f.status === 'Resolved' ? `<span class="badge" style="background: var(--success-color); color: white; font-size: 0.65rem; padding: 2px 4px; border-radius: 4px;">Resolved</span>` : f.status)}</div>`).join('') : ''}
                </td>
                <td><small>${escapeHtml(v.points_used || '-')}</small></td>
                <td>${v.next_followup ? new Date(v.next_followup).toLocaleDateString() : '-'}</td>
                <td class="action-cells">
                    <button class="icon-btn action-edit" data-id="${v.id}" title="Edit Visit"><i class="ph ph-pencil-simple"></i></button>
                    ${appState.featureFlags.enableVoiceRecording ? `<button class="icon-btn action-play" data-id="${v.id}" title="Play Audio Note"><i class="ph ph-speaker-high"></i></button>` : ''}
                    <button class="icon-btn danger-text action-delete" data-id="${v.id}" title="Delete"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `).join(''));

        tbody.querySelectorAll('.action-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const visit = await getRecord('visits', id);
                if (visit) openVisitModal(visit);
            });
        });

        if (appState.featureFlags.enableVoiceRecording) {
            tbody.querySelectorAll('.action-play').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const audioNotes = await getAllRecords('audio_notes');
                    const note = audioNotes.find(n => n.visit_id === id);
                    if (note && note.audio_blob) {
                        const audioUrl = URL.createObjectURL(note.audio_blob);
                        const audio = new Audio(audioUrl);
                        audio.play();
                        showToast('Playing voice note...', 'info');
                    } else {
                        showToast('No audio note found for this visit', 'warning');
                    }
                });
            });
        }

        tbody.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Are you sure you want to delete this visit record?')) {
                    await deleteRecord('visits', id);
                    showToast('Visit deleted', 'success');
                    loadVisits(document.getElementById('visitSearchInput').value);
                }
            });
        });

    } catch (e) {
        console.error(e);
        showToast('Error loading visits', 'error');
        tbody.innerHTML = '';
        safeInsertHTML(tbody, `<tr><td colspan="6" class="text-center error-text">Failed to load data.</td></tr>`);
    }
};

const openVisitModal = async (visit = null) => {
    const isEdit = !!visit;
    const title = isEdit ? 'Edit Visit' : 'Log New Visit';

    // Fetch Masters
    const masters = await getAllRecords('masters');
    const getMasterList = (type) => masters.find(m => m.type === type)?.list || [];
    const allComplaints = await getAllRecords('complaints');

    const complaintMaster = getMasterList('complaint_list');
    const extractName = (c) => typeof c === 'object' ? `${c.en} / ${c.ml}` : c;

    // [Phase-6C.3] Merge generic masters and local disease library for autocomplete
    const diseaseLibrary = await getAllRecords('disease_library');
    diseaseLibrary.sort((a, b) => {
        if ((b.usage_count || 0) !== (a.usage_count || 0)) {
            return (b.usage_count || 0) - (a.usage_count || 0);
        }
        return a.name.localeCompare(b.name);
    });

    // [Phase-8D] Initialize or fetch dynamic point library
    let pointLibraryMaster = masters.find(m => m.id === 'master_point_library');
    if (!pointLibraryMaster) {
        pointLibraryMaster = {
            id: 'master_point_library',
            type: 'point_library',
            list: [
                'KI3', 'LR3', 'SP6', 'ST36', 'LI4', 'LI11', 'SP9', 'GB34', 'UB60', 'BL57',
                'ST25', 'GB20', 'BL2', 'LU7', 'SP10', 'DU20', 'CV4', 'CV6', 'CV12', 'ST40'
            ]
        };
        await saveRecord('masters', pointLibraryMaster);
        masters.push(pointLibraryMaster);
    }
    const pointLibrary = pointLibraryMaster.list;

    // Deduplicate options
    const masterNames = complaintMaster.map(extractName);
    const uniqueDiseaseNames = [...new Set([...masterNames, ...diseaseLibrary.map(d => d.name)])];
    let combinedOptionsList = uniqueDiseaseNames;
    const diseaseOptions = ''; // Kept for backwards compatibility but we use custom dropdown now

    const modes = getMasterList('treatment_modes');
    const pulses = getMasterList('pulse_methods');
    const scales = getMasterList('response_scales');

    // Fetch patients
    const patients = await getAllRecords('patients');
    const patientOptions = patients.map(p =>
        `<option value="${p.id}" ${visit?.patient_id === p.id ? 'selected' : ''}>${escapeHtml(p.patient_id ? `[${p.patient_id}] ` + p.name : p.name)}</option>`
    ).join('');

    const todayStr = new Date().toISOString().split('T')[0];
    const visitDateStr = visit?.date ? new Date(visit.date).toISOString().split('T')[0] : todayStr;
    const followupDateStr = visit?.next_followup ? new Date(visit.next_followup).toISOString().split('T')[0] : '';

    const modeOptions = modes.map(m => `<option value="${escapeHtml(m)}" ${visit?.treatment_mode === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
    const pulseOptions = pulses.map(p => `<option value="${escapeHtml(p)}" ${visit?.pulse === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');

    const treatmentMethodsList = ['Single Needle', 'Multi Needle', 'Six Pulse Method', 'Element Pulse', 'Character Pulse', 'Single Point', 'TCM Standard', 'ASPM Method', 'Disease Effective Points'];
    const treatmentMethodOptions = treatmentMethodsList.map(m => `<option value="${escapeHtml(m)}" ${visit?.treatment_method === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');

    const responseOptImmed = scales.map(s => `<option value="${escapeHtml(s)}" ${visit?.immediate_response === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    const responseOptFeed = scales.map(s => `<option value="${escapeHtml(s)}" ${visit?.patient_feedback === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');

    const electroHtml = appState.featureFlags.enableElectroAcu ? `
        <div class="form-group" id="electroContainer" style="display: ${visit?.treatment_mode === 'Electro-Acupuncture' ? 'block' : 'none'};">
            <label>Electro-Acupuncture Freq</label>
            <input type="text" id="v_electro_freq" class="form-control" placeholder="e.g. 2Hz continuous">
        </div>
    ` : '';

    const voiceHtml = appState.featureFlags.enableVoiceRecording ? `
        <div class="audio-recorder-panel">
            <label style="display:block; margin-bottom:8px; font-size:0.85rem; font-weight:600; color:var(--text-secondary);">Voice Feedback Note (Offline)</label>
            <div class="recorder-controls">
                <button type="button" class="mic-btn" id="micBtn"><i class="ph ph-microphone"></i></button>
                <div class="timer-display" id="recTimer">00:00</div>
                <audio id="audioPlayback" controls style="display: none; height: 36px;"></audio>
            </div>
        </div>
    ` : '';

    const formHtml = `
        <form id="visitForm" class="standard-form">
            <input type="hidden" id="v_id" value="${visit?.id || ''}">
            
            <div class="form-row" style="align-items: flex-end;">
                <div class="form-group" style="flex: 1;">
                    <label>Patient *</label>
                    <select id="v_patient_id" class="form-control" required ${isEdit ? 'disabled' : ''}>
                        <option value="">-- Select Patient --</option>
                        ${patientOptions}
                    </select>
                </div>
                ${!isEdit ? `
                <div class="form-group" style="flex: 0 0 auto;">
                    <button type="button" class="btn-secondary" id="v_quick_repeat_btn" style="height: 38px;"><i class="ph ph-lightning"></i> Quick Repeat</button>
                </div>
                ` : ''}
                <div class="form-group" style="flex: 1;">
                    <label>Visit Date *</label>
                    <input type="date" id="v_date" class="form-control" required value="${visitDateStr}">
                </div>
            </div>

            <!-- [Phase-13A] Payment / Session Assignment -->
            <div class="form-group" style="margin-bottom: 16px;">
                <label>Payment / Session Type *</label>
                <select id="v_payment_type" class="form-control" required>
                    <option value="Paid" ${visit?.payment_type === 'Paid' ? 'selected' : (!visit ? 'selected' : '')}>Normal / Paid Visit</option>
                    <option value="Bonus" ${visit?.payment_type === 'Bonus' ? 'selected' : ''}>Use Scheme / Bonus Session</option>
                    <option value="Free" ${visit?.payment_type === 'Free' ? 'selected' : ''}>Free / Complimentary</option>
                </select>
                <div id="v_scheme_info" style="display: none; font-size: 0.8rem; margin-top: 4px; padding: 4px 8px; border-radius: 4px;"></div>
            </div>

            <!-- Follow-up Smart Panel -->
            <div id="v_followup_panel" style="display: none; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 16px; margin-bottom: 16px; background: var(--bg-surface-hover);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <label style="color: var(--brand-primary); font-weight: 600; margin: 0;"><i class="ph ph-activity"></i> Previous Conditions — Confirm</label>
                    <button type="button" class="btn-secondary" id="v_add_later_btn" style="padding: 4px 8px; font-size: 0.8rem;"><i class="ph ph-clock"></i> Add Later</button>
                </div>
                <div id="v_followup_list"></div>
            </div>

            <div class="form-group">
                <label>Treatment Mode</label>
                <select id="v_mode" class="form-control">
                    <option value="">-- Select Mode --</option>
                    ${modeOptions}
                </select>
            </div>

            <div class="form-group" style="position: relative; margin-bottom: 8px;">
                <label>Chief Complaint Treated (Primary)</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="position: relative; flex: 1;">
                        <input type="text" id="v_complaint" class="form-control" autocomplete="off" placeholder="Search diseases..." value="${escapeHtml(visit?.complaint || '')}">
                    </div>
                    <button type="button" class="btn-secondary" id="btnAddDiseaseMaster" style="display: none; white-space: nowrap;"><i class="ph ph-plus"></i> Add to Master</button>
                    <button type="button" class="btn-secondary" id="btnAddDiseaseLibrary" style="display: none; white-space: nowrap;"><i class="ph ph-star"></i> Save to Library</button>
                </div>
                
                <!-- [Phase-9] Clinical Intelligence Suggestion Panel -->
                <div id="v_intel_panel" style="display: none; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success-color); border-radius: var(--border-radius-sm); padding: 12px; margin-top: 8px;">
                    <div style="color: var(--success-color); font-weight: 600; font-size: 0.85rem; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="ph ph-brain"></i> Clinical Intelligence Suggestion</span>
                        <span id="v_intel_rate" style="background: var(--success-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;"></span>
                    </div>
                    <div style="font-size: 0.8rem; margin-bottom: 8px;">
                        <div>Based on <span id="v_intel_res"></span> resolved cases (out of <span id="v_intel_total"></span>)</div>
                        <div style="margin-top: 4px;"><strong>Recommended Points:</strong> <span id="v_intel_points" style="color: var(--brand-primary);"></span></div>
                    </div>
                    <button type="button" id="btn_use_intel" class="btn-secondary" style="font-size: 0.75rem; padding: 4px 8px; border-color: var(--success-color); background: white; color: var(--success-color);">
                        Use Suggestion
                    </button>
                </div>

            </div>

            <div class="form-group" style="margin-top: 16px; position: relative;">
                <label>Additional Complaints</label>
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                    <div style="position: relative; flex: 1;">
                        <input type="text" id="v_additional_complaint_input" class="form-control" autocomplete="off" placeholder="Search or add additional complaint...">
                    </div>
                    <button type="button" class="btn-secondary" id="btnAddAddlDiseaseLibrary" style="display: none; white-space: nowrap;"><i class="ph ph-star"></i> Save to Library</button>
                </div>
                <div id="v_additional_complaints_chips" class="chips-container" style="margin-bottom: 8px;"></div>
                <input type="hidden" id="v_additional_complaints" value="${escapeHtml((visit?.additional_complaints || []).join('|||'))}">
            </div>

            <div class="form-group" style="margin-bottom: 16px;">
                <label>Treatment Method</label>
                <select id="v_treatment_method" class="form-control">
                    <option value="Not Specified" ${!visit?.treatment_method || visit?.treatment_method === 'Not Specified' ? 'selected' : ''}>Not Specified</option>
                    ${treatmentMethodOptions}
                </select>
            </div>

            <!-- ASPM Guided Assessment Panel (Hidden by default) -->
            <div id="v_aspm_panel" style="display: none; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 16px; margin-bottom: 16px; background: var(--bg-surface-hover);">
                <label style="color: var(--brand-primary); font-weight: 600; margin-bottom: 12px; display: block;"><i class="ph ph-exam"></i> ASPM Guided Assessment</label>
                
                <div style="margin-bottom: 16px;">
                    <label style="font-size: 0.9rem; font-weight: 600; margin-bottom: 8px;">Section A – Clinical Pattern</label>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" id="aspm_chk_chronic"> Chronic condition</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" id="aspm_chk_recurrent"> Recurrent problem</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" id="aspm_chk_multiple"> Multiple complaints</label>
                    </div>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="font-size: 0.9rem; font-weight: 600; margin-bottom: 8px;">Section B – Energy Screening</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Morning weakness"> Morning weakness</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Post-meal heaviness"> Post-meal heaviness</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Fatigue"> Fatigue</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Bloating"> Bloating</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Edema"> Edema</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Sleep disturbance"> Sleep disturbance</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Irritability"> Irritability</label>
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem;"><input type="checkbox" class="aspm-energy-chk" value="Poor recovery"> Poor recovery</label>
                    </div>
                </div>

                <div id="aspm_rec_area" style="display: none; background: rgba(59, 130, 246, 0.1); border: 1px dashed var(--brand-primary); padding: 12px; border-radius: var(--border-radius-sm); margin-top: 16px;">
                    <div style="color: var(--brand-primary); font-weight: 600; margin-bottom: 12px; text-align: center;">⚡ ASPM Root-Based Protocol Recommended</div>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button type="button" class="primary-btn" id="btn_generate_aspm" style="font-size: 0.85rem; padding: 6px 12px;">Generate ASPM Structure</button>
                        <button type="button" class="btn-secondary" id="btn_continue_no_aspm" style="font-size: 0.85rem; padding: 6px 12px;">Continue Without ASPM</button>
                    </div>
                </div>
            </div>

            <!-- ASPM Protocol Box (Shown after Generate) -->
            <div id="v_aspm_protocol_panel" style="display: none; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 16px; margin-bottom: 16px; background: var(--bg-surface);">
                <label style="color: var(--brand-primary); font-weight: 600; margin-bottom: 12px; display: block;"><i class="ph ph-prescription"></i> ASPM Treatment Protocol</label>
                
                <div class="form-group" style="margin-bottom: 12px; position: relative;">
                    <label style="font-size: 0.85rem;">1️⃣ Pulse / Root</label>
                    <input type="text" id="aspm_p_root" class="form-control" autocomplete="off">
                </div>
                <div class="form-group" style="margin-bottom: 12px; position: relative;">
                    <label style="font-size: 0.85rem;">2️⃣ System Activation</label>
                    <input type="text" id="aspm_p_system" class="form-control" autocomplete="off">
                </div>
                <div class="form-group" style="margin-bottom: 12px; position: relative;">
                    <label style="font-size: 0.85rem;">3️⃣ Symptom Points (Supports multiple)</label>
                    <input type="text" id="aspm_p_symptom" class="form-control" autocomplete="off">
                    <div id="aspm_p_symptom_chips" class="chips-container" style="margin-top: 4px;"></div>
                </div>
                <div class="form-group" style="margin-bottom: 12px; position: relative;">
                    <label style="font-size: 0.85rem;">4️⃣ Immunity Point</label>
                    <input type="text" id="aspm_p_immunity" class="form-control" autocomplete="off">
                </div>
                <div class="form-group" style="margin-bottom: 12px; position: relative;">
                    <label style="font-size: 0.85rem;">5️⃣ Waste Effluence</label>
                    <input type="text" id="aspm_p_waste" class="form-control" autocomplete="off">
                </div>
            </div>

            <!-- [Phase-9B] Clinical Memory Panel (Previous Conditions) -->
            <div id="v_clinical_memory_panel" style="display: none; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 16px; margin-bottom: 16px; background: var(--bg-surface-hover);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <label style="color: var(--brand-primary); font-weight: 600; margin: 0;"><i class="ph ph-clock-counter-clockwise"></i> Previous Conditions</label>
                </div>
                <div id="v_clinical_memory_list"></div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Pulse Diagnosis</label>
                    <select id="v_pulse" class="form-control">
                        <option value="">-- Select Pulse --</option>
                        ${pulseOptions}
                    </select>

                    <!-- [Phase-23] Five Element Pulse Tracking -->
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                        <label style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; display: block;">Element Pulse Combinations</label>
                        <div id="v_pulse_element_buttons" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
                            <button type="button" class="btn-secondary btn-pulse-element-toggle" data-val="WATER">WATER</button>
                            <button type="button" class="btn-secondary btn-pulse-element-toggle" data-val="WOOD">WOOD</button>
                            <button type="button" class="btn-secondary btn-pulse-element-toggle" data-val="FIRE">FIRE</button>
                            <button type="button" class="btn-secondary btn-pulse-element-toggle" data-val="EARTH">EARTH</button>
                            <button type="button" class="btn-secondary btn-pulse-element-toggle" data-val="METAL">METAL</button>
                        </div>
                        <div id="v_pulse_elements_chips" class="chips-container"></div>
                        <input type="hidden" id="v_pulse_elements" value="${escapeHtml(Array.isArray(visit?.pulse_elements) ? visit.pulse_elements.join('|||') : (visit?.pulse_elements || ''))}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Syndromes (Optional)</label>
                    <div id="v_element_buttons" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
                        <button type="button" class="btn-secondary btn-element-toggle" data-val="WATER">WATER</button>
                        <button type="button" class="btn-secondary btn-element-toggle" data-val="WOOD">WOOD</button>
                        <button type="button" class="btn-secondary btn-element-toggle" data-val="FIRE">FIRE</button>
                        <button type="button" class="btn-secondary btn-element-toggle" data-val="EARTH">EARTH</button>
                        <button type="button" class="btn-secondary btn-element-toggle" data-val="METAL">METAL</button>
                    </div>
                    <div id="v_elements_chips" class="chips-container"></div>
                    <input type="hidden" id="v_element" value="${escapeHtml(Array.isArray(visit?.element) ? visit.element.join('|||') : (visit?.element || ''))}">
                    
                    <!-- Protocol Memory Panel (Shared for Syndrome & Pulse) -->
                    <div id="v_element_protocol_panel" style="display: none; border: 1px dashed var(--brand-primary); background: rgba(59, 130, 246, 0.05); border-radius: var(--border-radius-sm); padding: 12px; margin-top: 12px;">
                        <div style="color: var(--brand-primary); font-weight: 600; font-size: 0.85rem; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <span><i class="ph ph-sparkle"></i> Protocol Memory (<span id="v_ep_pattern_name"></span>)</span>
                            <span id="v_ep_success_rate" style="background: var(--success-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;"></span>
                        </div>
                        <div id="v_ep_points_box" style="margin-bottom: 8px;"></div>
                        <button type="button" id="btn_use_ep_points" class="btn-secondary" style="font-size: 0.75rem; padding: 4px 8px; border-color: var(--brand-primary); color: var(--brand-primary); background: white;">
                            Use These Points
                        </button>
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label>Smart Points Used (Type Channel e.g. ST)</label>
                <div style="position: relative;">
                    <input type="text" id="v_points_input" class="form-control" placeholder="Search points..." autocomplete="off">
                </div>
                <!-- Smart Points output container -->
                <div id="v_points_chips" class="chips-container"></div>
                <!-- Hidden input to hold the raw string -->
                <input type="hidden" id="v_points" value="${escapeHtml(visit?.points_used || '')}">
            </div>

            ${electroHtml}

            <!-- Response Tracking System -->
            <div class="form-row">
                <div class="form-group">
                    <label>Immediate Response (Doctor)</label>
                    <select id="v_imm_resp" class="form-control">
                        <option value="">-- Select Reaction --</option>
                         ${responseOptImmed}
                    </select>
                </div>
                <div class="form-group">
                    <label>Patient Feedback (From Prev)</label>
                    <select id="v_pat_feed" class="form-control">
                        <option value="">-- Select Outcome --</option>
                        <option value="Resolved" ${visit?.patient_feedback === 'Resolved' ? 'selected' : ''}>Resolved</option>
                        <option value="Improved" ${visit?.patient_feedback === 'Improved' ? 'selected' : ''}>Improved</option>
                        <option value="Same" ${visit?.patient_feedback === 'Same' ? 'selected' : ''}>Same</option>
                        <option value="Worse" ${visit?.patient_feedback === 'Worse' ? 'selected' : ''}>Worse</option>
                    </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Next Follow-up Date</label>
                    <input type="date" id="v_followup" class="form-control" value="${followupDateStr}">
                </div>
            </div>

            <div class="form-group">
                <label>Additional Notes</label>
                <textarea id="v_notes" class="form-control" rows="2">${escapeHtml(visit?.notes || '')}</textarea>
            </div>

            ${voiceHtml}
        </form>
    `;

    showModal(title, formHtml, async () => {
        const patientId = document.getElementById('v_patient_id').value;
        const dateStr = document.getElementById('v_date').value;

        if (!patientId || !dateStr) {
            showToast('Patient and Date are required', 'warning');
            return false;
        }

        const electroEl = document.getElementById('v_electro_freq');
        const modeEl = document.getElementById('v_mode').value;
        const pType = document.getElementById('v_payment_type').value;

        // [Phase-13A] Scheme Session checks
        let activeSchemeToUpdate = null;
        if (pType === 'Bonus') {
            const upAllSch = await getAllRecords('patient_schemes');
            activeSchemeToUpdate = upAllSch.find(ps => ps.patient_id === patientId && ps.status === 'Active');
            if (!activeSchemeToUpdate && !isEdit) {
                showToast('Cannot deduct session. Patient has no active scheme.', 'error');
                return false;
            }
            if (!isEdit && activeSchemeToUpdate && activeSchemeToUpdate.remaining_sessions <= 0) {
                showToast('Active scheme has 0 sessions remaining.', 'error');
                return false;
            }
        }

        const record = {
            id: document.getElementById('v_id').value || undefined,
            patient_id: patientId,
            date: new Date(dateStr).getTime(),
            payment_type: pType,
            treatment_mode: modeEl,
            treatment_method: document.getElementById('v_treatment_method').value || 'Not Specified',
            complaint: document.getElementById('v_complaint').value.trim(),
            pulse: document.getElementById('v_pulse').value,
            // process v_element below since it's an array now
            element: document.getElementById('v_element').value,
            points_used: document.getElementById('v_points').value,
            electro_used: modeEl === 'Electro-Acupuncture',
            electro_freq: electroEl ? electroEl.value : null,
            immediate_response: document.getElementById('v_imm_resp').value,
            patient_feedback: document.getElementById('v_pat_feed').value,
            next_followup: document.getElementById('v_followup').value ? new Date(document.getElementById('v_followup').value).getTime() : null,
            notes: document.getElementById('v_notes').value.trim()
        };

        const aspmProtPanel = document.getElementById('v_aspm_protocol_panel');
        if (aspmProtPanel && aspmProtPanel.style.display !== 'none') {
            record.aspm_protocol = {
                root: document.getElementById('aspm_p_root').value.trim(),
                system: document.getElementById('aspm_p_system').value.trim(),
                symptom: document.getElementById('aspm_p_symptom').value.trim(),
                immunity: document.getElementById('aspm_p_immunity').value.trim(),
                waste: document.getElementById('aspm_p_waste').value.trim()
            };

            // [Phase-8D] Auto-save new points to library
            let updatedLibrary = false;
            const newLibList = [...pointLibrary];

            const extractAndAddPoints = (ptStr) => {
                if (!ptStr) return;
                const pts = ptStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
                for (const pt of pts) {
                    if (!newLibList.includes(pt)) {
                        newLibList.push(pt);
                        updatedLibrary = true;
                    }
                }
            };

            extractAndAddPoints(record.aspm_protocol.root);
            extractAndAddPoints(record.aspm_protocol.system);
            extractAndAddPoints(record.aspm_protocol.symptom);
            extractAndAddPoints(record.aspm_protocol.immunity);
            extractAndAddPoints(record.aspm_protocol.waste);

            if (updatedLibrary) {
                pointLibraryMaster.list = newLibList;
                saveRecord('masters', pointLibraryMaster).catch(console.error);
            }

        } else if (aspmProtPanel && record.treatment_method !== 'ASPM Method') {
            record.aspm_protocol = null;
        } else if (visit && visit.aspm_protocol) {
            record.aspm_protocol = visit.aspm_protocol;
        }

        try {
            // [Phase-9B] Process Clinical Memory Outcomes
            const memoryCards = document.querySelectorAll('.clinical-memory-card');
            for (const card of memoryCards) {
                const status = card.dataset.selStatus;
                if (status) {
                    const mid = card.dataset.mid;
                    const complaintName = card.dataset.complaint;
                    const memoryRecord = await getRecord('clinical_memory', mid);

                    if (memoryRecord && memoryRecord.status !== status) {
                        memoryRecord.status = status;
                        await saveRecord('clinical_memory', memoryRecord);

                        // Feed Outcome Intelligence Engine
                        if (status === 'resolved' || status === 'improved') {
                            const outcomeRec = {
                                id: 'outcome_memory_' + mid + '_' + Date.now(),
                                disease: complaintName,
                                treatment_method: memoryRecord.treatment_method,
                                outcome: status.charAt(0).toUpperCase() + status.slice(1), // Resolved or Improved
                                visit_date: record.date,
                                visit_id: record.id || 'new_visit', // will be replaced if new
                                points_used: memoryRecord.points_used || []
                            };
                            await saveRecord('outcome_records', outcomeRec);
                            // We will trigger updateDiseaseIntelligence for this below
                            record._triggerIntelUpdate = record._triggerIntelUpdate || [];
                            if (!record._triggerIntelUpdate.includes(complaintName)) {
                                record._triggerIntelUpdate.push(complaintName);
                            }
                        }
                    }
                }
            }
            // Process followups before saving visit
            const followupCards = document.querySelectorAll('.followup-condition-card');
            const followups = [];
            for (const card of followupCards) {
                const status = card.dataset.selStatus;
                if (status) {
                    const cid = card.dataset.cid;
                    const imp = card.dataset.selImp;
                    const complaint = allComplaints.find(c => c.id === cid);
                    if (complaint) {
                        complaint.status = status;
                        if (status === 'Resolved') {
                            complaint.resolved_date = Date.now();
                        } else if (status === 'improving' && imp) {
                            complaint.improvement_percent = parseInt(imp, 10);
                        } else {
                            delete complaint.improvement_percent;
                        }
                        await saveRecord('complaints', complaint);
                        followups.push({ complaint_id: cid, name: complaint.name, status: status, improvement_percent: complaint.improvement_percent });
                    }
                }
            }

            if (followups.length > 0) {
                record.followups = followups;
            }

            // [Phase-7C / Phase-23] Strict Element Validation (Multi-Select Array)
            const allowedElements = ['WATER', 'WOOD', 'FIRE', 'EARTH', 'METAL'];

            const rawElementStr = document.getElementById('v_element').value;
            if (rawElementStr) {
                record.element = rawElementStr.split('|||').filter(e => allowedElements.includes(e));
            } else {
                record.element = [];
            }

            const rawPulseElementStr = document.getElementById('v_pulse_elements').value;
            if (rawPulseElementStr) {
                record.pulse_elements = rawPulseElementStr.split('|||').filter(e => allowedElements.includes(e));
            } else {
                record.pulse_elements = [];
            }

            // [Phase-17/23] Element/Pulse Protocol Memory Engine Check
            const checkAndSaveProtocol = async (pattern, points) => {
                if (points) {
                    const allEPs = await getAllRecords('element_protocol_memory');
                    const existingEp = allEPs.find(p => p.imbalance_pattern === pattern && p.points === points);

                    if (existingEp) {
                        existingEp.usage_count = (existingEp.usage_count || 0) + 1;
                        existingEp.last_used = Date.now();
                        await saveRecord('element_protocol_memory', existingEp);
                    } else {
                        if (confirm(`Save this new point combination (${points}) as a memory protocol for ${pattern}?`)) {
                            await saveRecord('element_protocol_memory', {
                                imbalance_pattern: pattern,
                                points: points,
                                usage_count: 1,
                                success_count: 0,
                                last_used: Date.now(),
                                notes: ''
                            });
                            showToast('Protocol Memory Saved', 'success');
                        }
                    }
                }
            };

            if (record.points_used) {
                // Save Syndrome pattern if applicable
                if (record.element && record.element.length > 0) {
                    const epPattern = [...record.element].sort().join(' + ');
                    await checkAndSaveProtocol(epPattern, record.points_used.trim());
                }
                // Save Pulse pattern if applicable
                if (record.pulse_elements && record.pulse_elements.length > 0) {
                    const pulsePattern = [...record.pulse_elements].sort().join(' + ');
                    await checkAndSaveProtocol(pulsePattern, record.points_used.trim());
                }
            }

            // [Phase-6D] Update patient's last_visit_mode
            const patRecord = patients.find(p => p.id === patientId);
            if (patRecord && modeEl && patRecord.last_visit_mode !== modeEl) {
                patRecord.last_visit_mode = modeEl;
                await saveRecord('patients', patRecord);
            }

            // [Phase-6C.3] Extract Additional Complaints from hidden input string
            const hiddenAddl = document.getElementById('v_additional_complaints').value;
            record.additional_complaints = hiddenAddl ? hiddenAddl.split('|||').map(s => s.trim()).filter(Boolean) : [];

            // [Phase-6C.2] Sync to complaints store
            const currentComplaints = await getAllRecords('complaints');
            const patientExisting = currentComplaints.filter(c => c.patient_id === patientId);

            const handleComplaintSave = async (rawName, isPrimary) => {
                if (!rawName) return;
                const cName = rawName.trim().replace(/\s+/g, ' ');

                // [Phase-6C.4] Auto-save / increment usage in disease library
                const existingLib = diseaseLibrary.find(d => d.name.toLowerCase() === cName.toLowerCase());
                if (existingLib) {
                    existingLib.usage_count = (existingLib.usage_count || 0) + 1;
                    await saveRecord('disease_library', existingLib);
                } else {
                    await saveRecord('disease_library', {
                        name: cName,
                        usage_count: 1
                    });
                    diseaseLibrary.push({ name: cName, usage_count: 1 });
                }

                const existing = patientExisting.find(c => c.name.toLowerCase() === cName.toLowerCase());
                if (!existing) {
                    await saveRecord('complaints', {
                        patient_id: patientId,
                        name: cName,
                        status: 'Active',
                        priority: isPrimary ? 'High' : 'Normal',
                        first_detected: Date.now(),
                        resolved_date: null,
                        recurrence_count: 0,
                        late_reported: false,
                        treated: true,
                        primary: isPrimary,
                        recurrences: []
                    });
                } else if (!existing.primary && isPrimary) {
                    existing.primary = true;
                    existing.priority = 'High';
                    await saveRecord('complaints', existing);
                } else if (!existing.treated) {
                    existing.treated = true;
                    await saveRecord('complaints', existing);
                }
            };

            await handleComplaintSave(record.complaint, true);
            for (const acName of record.additional_complaints) {
                await handleComplaintSave(acName, false);
            }

            // [Phase-9] Outcome Intelligence Engine Hooks
            const updateDiseaseIntelligence = async (diseaseName) => {
                if (!diseaseName) return;
                const dNameUpper = diseaseName.trim().toUpperCase();
                try {
                    const allOutcomes = await getAllRecords('outcome_records');
                    const diseaseOutcomes = allOutcomes.filter(o => o.disease.toUpperCase() === dNameUpper);

                    if (diseaseOutcomes.length === 0) return;

                    const totalCases = diseaseOutcomes.length;
                    const resolvedCases = diseaseOutcomes.filter(o => o.outcome === 'Resolved' || o.outcome === 'Improved');
                    const pureResolved = diseaseOutcomes.filter(o => o.outcome === 'Resolved');

                    const pointFreq = {};
                    resolvedCases.forEach(o => {
                        if (Array.isArray(o.points_used)) {
                            o.points_used.forEach(p => {
                                const pt = p.toUpperCase().trim();
                                if (pt && !pt.includes('SELECT POINTS')) {
                                    pointFreq[pt] = (pointFreq[pt] || 0) + 1;
                                }
                            });
                        }
                    });

                    const sortedPoints = Object.keys(pointFreq).sort((a, b) => pointFreq[b] - pointFreq[a]);
                    const bestPoints = sortedPoints.slice(0, 5); // top 5

                    const successRate = totalCases > 0 ? Math.round((pureResolved.length / totalCases) * 100) : 0;

                    const intelRecord = {
                        disease: dNameUpper,
                        best_points: bestPoints,
                        success_rate: successRate,
                        total_cases: totalCases,
                        resolved_cases: pureResolved.length,
                        updated_at: Date.now()
                    };

                    await saveRecord('disease_intelligence', intelRecord);
                } catch (err) {
                    console.error("Phase-9: Failed intelligence update", err);
                }
            };

            const savedVisit = await saveRecord('visits', record);

            // [Phase-9B] Trigger Intelligence updates from memory outcomes
            if (record._triggerIntelUpdate) {
                for (const dName of record._triggerIntelUpdate) {
                    // Update the visit_id on those outcome records if it was a new visit
                    const allOut = await getAllRecords('outcome_records');
                    const pendingNew = allOut.filter(o => o.visit_id === 'new_visit');
                    for (const p of pendingNew) {
                        p.visit_id = savedVisit.id;
                        await saveRecord('outcome_records', p);
                    }
                    await updateDiseaseIntelligence(dName);
                }
                delete record._triggerIntelUpdate;
            }

            // [Phase-9B] Save New Clinical Memory Entries for this visit
            const combinedComplaints = [record.complaint, ...record.additional_complaints].filter(Boolean);
            const uniqueCombined = [...new Set(combinedComplaints.map(c => c.trim().replace(/\s+/g, ' ')))];

            let allPtsForMemory = [];
            if (record.points_used) allPtsForMemory = allPtsForMemory.concat(record.points_used.split(',').map(s => s.trim()).filter(Boolean));
            if (record.aspm_protocol) {
                ['root', 'system', 'symptom', 'immunity', 'waste'].forEach(k => {
                    if (record.aspm_protocol[k]) {
                        allPtsForMemory = allPtsForMemory.concat(record.aspm_protocol[k].split(',').map(s => s.trim()).filter(Boolean));
                    }
                });
            }
            const uniquePtsForMemory = [...new Set(allPtsForMemory)];

            for (const cName of uniqueCombined) {
                await saveRecord('clinical_memory', {
                    patient_id: record.patient_id,
                    complaint: cName,
                    visit_id: savedVisit.id,
                    status: 'active',
                    treatment_method: record.treatment_method,
                    points_used: uniquePtsForMemory,
                    visit_date: record.date
                });
            }

            // [Phase-9] Record Outcome Record
            if (record.patient_feedback) {
                const outcomeRec = {
                    id: 'outcome_visit_' + savedVisit.id,
                    disease: record.complaint,
                    treatment_method: record.treatment_method,
                    outcome: record.patient_feedback,
                    visit_date: savedVisit.date,
                    visit_id: savedVisit.id,
                };

                let allPts = [];
                if (record.points_used) allPts = allPts.concat(record.points_used.split(',').map(s => s.trim()).filter(Boolean));

                if (record.aspm_protocol) {
                    ['root', 'system', 'symptom', 'immunity', 'waste'].forEach(k => {
                        if (record.aspm_protocol[k]) {
                            allPts = allPts.concat(record.aspm_protocol[k].split(',').map(s => s.trim()).filter(Boolean));
                        }
                    });
                }
                outcomeRec.points_used = [...new Set(allPts)];

                await saveRecord('outcome_records', outcomeRec);
                updateDiseaseIntelligence(record.complaint);

                // [Phase-17] Increment Element Protocol Success Count
                if ((record.patient_feedback === 'Resolved' || record.patient_feedback === 'Improved') && record.treatment_method === 'Element Pulse' && record.element && record.element.length > 0) {
                    const epPattern = [...record.element].sort().join(' + ');
                    const epPoints = outcomeRec.points_used.join(', '); // Note: this might differ slightly in spacing from original save format

                    try {
                        const allEPs = await getAllRecords('element_protocol_memory');
                        // Find a protocol with the same pattern that contains the core points, or exact match if preferred
                        const matchingEp = allEPs.find(p => p.imbalance_pattern === epPattern && p.points === record.points_used.trim());
                        if (matchingEp) {
                            matchingEp.success_count = (matchingEp.success_count || 0) + 1;
                            await saveRecord('element_protocol_memory', matchingEp);
                            console.log('Phase-17: Incremented success count for element protocol');
                        }
                    } catch (e) {
                        console.error('Phase-17 Error updating protocol success:', e);
                    }
                }
            }

            // Save audio blob if exists
            if (audioBlobState) {
                await saveRecord('audio_notes', {
                    visit_id: savedVisit.id,
                    audio_blob: audioBlobState
                });
            }

            // [Phase-13A] Deduct session on new visit save
            if (!isEdit && pType === 'Bonus' && activeSchemeToUpdate) {
                activeSchemeToUpdate.used_sessions += 1;
                activeSchemeToUpdate.remaining_sessions -= 1;
                if (activeSchemeToUpdate.remaining_sessions <= 0) {
                    activeSchemeToUpdate.status = 'Completed';
                }
                await saveRecord('patient_schemes', activeSchemeToUpdate);
            }

            showToast(`Visit ${isEdit ? 'updated' : 'logged'} successfully`, 'success');
            loadVisits(document.getElementById('visitSearchInput')?.value || '');
            return true;
        } catch (e) {
            console.error(e);
            throw new Error('Database Error');
        }
    }, 'Save Visit', 'lg');

    // UI Bindings after modal open

    // [Phase-13A] Bind scheme info visibility
    const bindSchemeInfo = async () => {
        const pType = document.getElementById('v_payment_type').value;
        const pId = document.getElementById('v_patient_id').value;
        const infoEl = document.getElementById('v_scheme_info');

        if (pType === 'Bonus' && pId) {
            const allSch = await getAllRecords('patient_schemes');
            const active = allSch.find(s => s.patient_id === pId && s.status === 'Active');
            if (active) {
                infoEl.style.display = 'block';
                if (active.remaining_sessions > 0) {
                    infoEl.style.background = 'rgba(16, 185, 129, 0.1)';
                    infoEl.style.color = 'var(--success)';
                    infoEl.innerHTML = `<i class="ph ph-check-circle"></i> Active scheme found. ${active.remaining_sessions} sessions remaining.`;
                } else {
                    infoEl.style.background = 'rgba(220, 38, 38, 0.1)';
                    infoEl.style.color = 'var(--error)';
                    infoEl.innerHTML = `<i class="ph ph-x-circle"></i> Scheme found but 0 sessions remaining.`;
                }
            } else {
                infoEl.style.display = 'block';
                infoEl.style.background = 'rgba(245, 158, 11, 0.1)';
                infoEl.style.color = 'var(--warning)';
                infoEl.innerHTML = `<i class="ph ph-warning-circle"></i> No active scheme found for this patient.`;
            }
        } else {
            infoEl.style.display = 'none';
        }
    };

    document.getElementById('v_payment_type').addEventListener('change', bindSchemeInfo);
    document.getElementById('v_patient_id').addEventListener('change', bindSchemeInfo);
    bindSchemeInfo();

    const renderFollowupPanel = (patientId) => {
        const panel = document.getElementById('v_followup_panel');
        const listContainer = document.getElementById('v_followup_list');
        if (!panel || !listContainer) return;

        if (!patientId) {
            panel.style.display = 'none';
            return;
        }

        const patientComplaints = allComplaints.filter(c => c.patient_id === patientId && (c.status === 'Active' || c.status === 'Recurred' || c.status === 'improving'));

        panel.style.display = 'block';
        if (listContainer) {
            listContainer.innerHTML = '';
            if (patientComplaints.length === 0) {
                safeInsertHTML(listContainer, '<div style="color: var(--text-secondary); font-size: 0.9rem; padding: 8px 0;">No active conditions found. Click Add Later to report.</div>');
            } else {
                const htmlToInsert = patientComplaints.map(c => `
                     <div class="followup-condition-card" data-cid="${c.id}" style="margin-top: 12px; padding: 12px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-surface);">
                         <div style="font-weight: 600; margin-bottom: 8px;">
                             ${escapeHtml(c.name)}
                             ${c.primary ? '<span class="badge" style="background: var(--brand-primary); color: white; margin-left: 8px; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;">Primary</span>' : ''}
                             ${c.late_reported ? '<span class="badge" style="background: purple; color: white; margin-left: 8px; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;">Late</span>' : ''}
                         </div>
                         <div class="status-chips" style="display: flex; gap: 8px; flex-wrap: wrap;">
                             <button type="button" class="btn-chip" data-status="Resolved">മാറി | Resolved</button>
                             <button type="button" class="btn-chip" data-status="improving">കുറവുണ്ട് | Improving</button>
                             <button type="button" class="btn-chip" data-status="No Change">അതുപോലെ | No Change</button>
                             <button type="button" class="btn-chip" data-status="Worse">കൂടി | Worse</button>
                         </div>
                         <div class="improvement-panel" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color);">
                             <label>Improvement: <span class="imp-value">50</span>%</label>
                             <input type="range" class="imp-slider w-100" min="0" max="100" step="5" value="50">
                             <div style="display: flex; gap: 8px; margin-top: 8px;">
                                 <button type="button" class="btn-secondary btn-quick-imp" data-val="25">25%</button>
                                 <button type="button" class="btn-secondary btn-quick-imp" data-val="50">50%</button>
                                 <button type="button" class="btn-secondary btn-quick-imp" data-val="75">75%</button>
                             </div>
                         </div>
                     </div>
                `).join('');
                safeInsertHTML(listContainer, htmlToInsert);
            }
        }

        listContainer.querySelectorAll('.followup-condition-card').forEach(card => {
            const chips = card.querySelectorAll('.btn-chip');
            const impPanel = card.querySelector('.improvement-panel');
            const slider = card.querySelector('.imp-slider');
            const valDisplay = card.querySelector('.imp-value');
            const quickBtns = card.querySelectorAll('.btn-quick-imp');

            chips.forEach(chip => {
                chip.addEventListener('click', (e) => {
                    chips.forEach(c => c.classList.remove('active-chip'));
                    e.target.classList.add('active-chip');
                    const status = e.target.dataset.status;
                    card.dataset.selStatus = status;

                    if (status === 'improving') {
                        impPanel.style.display = 'block';
                        if (!card.dataset.selImp && slider) {
                            card.dataset.selImp = slider.value;
                        }
                    } else {
                        impPanel.style.display = 'none';
                        card.dataset.selImp = '';
                    }
                });
            });

            if (slider) {
                slider.addEventListener('input', (e) => {
                    valDisplay.textContent = e.target.value;
                    card.dataset.selImp = e.target.value;
                });
            }

            quickBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const val = e.target.dataset.val;
                    if (slider) slider.value = val;
                    valDisplay.textContent = val;
                    card.dataset.selImp = val;
                });
            });
        });
    };

    // [Phase-9B] Render Clinical Memory Panel
    const renderClinicalMemoryPanel = async (patientId) => {
        const panel = document.getElementById('v_clinical_memory_panel');
        const listContainer = document.getElementById('v_clinical_memory_list');
        if (!panel || !listContainer) return;

        if (!patientId) {
            panel.style.display = 'none';
            return;
        }

        try {
            const allMemories = await getAllRecords('clinical_memory');
            // Filter by patient and exclude resolved
            const patientMemories = allMemories.filter(m => m.patient_id === patientId && m.status !== 'resolved');

            // Deduplicate to show only the latest active record for each complaint
            const uniqueMemoriesMap = new Map();
            patientMemories.sort((a, b) => b.visit_date - a.visit_date).forEach(m => {
                if (!uniqueMemoriesMap.has(m.complaint.toLowerCase())) {
                    uniqueMemoriesMap.set(m.complaint.toLowerCase(), m);
                }
            });
            const uniqueMemories = Array.from(uniqueMemoriesMap.values());

            if (uniqueMemories.length === 0) {
                panel.style.display = 'none';
                return;
            }

            panel.style.display = 'block';
            listContainer.innerHTML = uniqueMemories.map(m => `
                <div class="clinical-memory-card" data-mid="${m.id}" data-complaint="${escapeHtml(m.complaint)}" style="margin-top: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-surface); display: flex; flex-direction: column; gap: 8px;">
                    <div style="font-weight: 600; font-size: 0.95rem;">${escapeHtml(m.complaint)}</div>
                    <div class="status-chips" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="btn-chip" data-status="resolved">മാറി | Resolved</button>
                        <button type="button" class="btn-chip" data-status="improved">കുറവുണ്ട് | Improved</button>
                        <button type="button" class="btn-chip" data-status="same">അതുപോലെ | Same</button>
                        <button type="button" class="btn-chip" data-status="worse">കൂടി | Worse</button>
                    </div>
                </div>
            `).join('');

            // Bind chips
            listContainer.querySelectorAll('.clinical-memory-card').forEach(card => {
                const chips = card.querySelectorAll('.btn-chip');
                chips.forEach(chip => {
                    chip.addEventListener('click', (e) => {
                        chips.forEach(c => c.classList.remove('active-chip'));
                        e.target.classList.add('active-chip');
                        card.dataset.selStatus = e.target.dataset.status;
                    });
                });
            });

        } catch (e) {
            console.error("Failed to load clinical memory", e);
        }
    };

    // UI bindings must happen AFTER modal is added to DOM by showModal
    // So we use a setTimeout or execute immediately if showModal is synchronous.
    // showModal executes synchronously but adds to DOM immediately.
    const patientSelect = document.getElementById('v_patient_id');
    if (patientSelect) {
        patientSelect.addEventListener('change', (e) => {
            renderFollowupPanel(e.target.value);
            renderClinicalMemoryPanel(e.target.value); // [Phase-9B] Render Clinical Memory
            // [Phase-6D] Smart Default Mode
            if (!visit) {
                const pat = patients.find(p => p.id === e.target.value);
                if (pat) document.getElementById('v_mode').value = pat.last_visit_mode || 'Clinic Treatment';
            }
        });
        if (patientSelect.value) {
            renderFollowupPanel(patientSelect.value);
            renderClinicalMemoryPanel(patientSelect.value); // [Phase-9B] Render Clinical Memory
            if (!visit) {
                const pat = patients.find(p => p.id === patientSelect.value);
                if (pat) document.getElementById('v_mode').value = pat.last_visit_mode || 'Clinic Treatment';
            }
        }
    }

    // [Phase-6D] Quick Repeat Button
    const quickRepeatBtn = document.getElementById('v_quick_repeat_btn');
    if (quickRepeatBtn) {
        quickRepeatBtn.addEventListener('click', async () => {
            const pid = patientSelect?.value;
            if (!pid) {
                showToast('Please select a patient first', 'warning');
                return;
            }
            try {
                const allVisits = await getAllRecords('visits');
                const patVisits = allVisits.filter(v => v.patient_id === pid).sort((a, b) => b.date - a.date);
                if (patVisits.length === 0) {
                    showToast('No previous visits found for this patient', 'info');
                    return;
                }
                const last = patVisits[0];
                document.getElementById('v_complaint').value = last.complaint || '';
                if (last.treatment_mode) document.getElementById('v_mode').value = last.treatment_mode;

                // Addl complaints
                const addl = last.additional_complaints || [];
                document.getElementById('v_additional_complaints').value = addl.join('|||');

                const chipsContainer = document.getElementById('v_additional_complaints_chips');
                if (chipsContainer) {
                    chipsContainer.innerHTML = addl.map(p => `
                        <span class="chip">
                            ${escapeHtml(p)}
                            <button type="button" class="chip-remove" data-val="${escapeHtml(p)}"><i class="ph ph-x"></i></button>
                        </span>
                    `).join('');

                    chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
                        btn.addEventListener('click', (ev) => {
                            const val = ev.currentTarget.dataset.val;
                            const hInput = document.getElementById('v_additional_complaints');
                            let items = hInput.value ? hInput.value.split('|||') : [];
                            items = items.filter(s => s !== val);
                            hInput.value = items.join('|||');
                            ev.currentTarget.parentElement.remove();
                        });
                    });
                }

                showToast('Pre-filled from last visit', 'success');
                document.getElementById('v_complaint').focus();
            } catch (e) { console.error(e); }
        });
    }

    const btnAddLater = document.getElementById('v_add_later_btn');
    if (btnAddLater) {
        btnAddLater.addEventListener('click', () => {
            const pid = document.getElementById('v_patient_id')?.value;
            if (!pid) {
                showToast('Please select a patient first', 'warning');
                return;
            }
            // Minimal inline prompt to add a late complaint quickly
            const compName = prompt('Enter Late Complaint Name (will be marked Pending):');
            if (compName && compName.trim() !== '') {
                saveRecord('complaints', {
                    patient_id: pid,
                    name: compName.trim(),
                    status: 'Active',
                    priority: 'High',
                    first_detected: Date.now(),
                    resolved_date: null,
                    recurrence_count: 0,
                    late_reported: true,
                    treated: false,
                    recurrences: []
                }).then(async () => {
                    showToast('Late Complaint Added', 'success');
                    const updated = await getAllRecords('complaints');
                    allComplaints.length = 0;
                    allComplaints.push(...updated);
                    renderFollowupPanel(pid);
                }).catch(e => {
                    console.error(e);
                    showToast('Failed to save', 'error');
                });
            }
        });
    }

    // Disease Master Add Mapping
    const complaintInput = document.getElementById('v_complaint');
    const btnAddDiseaseMaster = document.getElementById('btnAddDiseaseMaster');
    const existingDiseases = combinedOptionsList; // Uses combined list from above

    const bindLibrarySaveBtn = (inputId, btnId) => {
        const inputEl = document.getElementById(inputId);
        const btnEl = document.getElementById(btnId);
        if (!inputEl || !btnEl) return;

        inputEl.addEventListener('input', (e) => {
            const val = e.target.value.trim().replace(/\s+/g, ' ');
            if (val && !existingDiseases.includes(val)) {
                btnEl.style.display = 'inline-flex';
            } else {
                btnEl.style.display = 'none';
            }
        });

        btnEl.addEventListener('click', async () => {
            let val = inputEl.value.trim().replace(/\s+/g, ' ');
            if (!val) return;

            try {
                // Duplicate guard
                const existingLib = diseaseLibrary.find(d => d.name.toLowerCase() === val.toLowerCase());
                if (existingLib) {
                    existingLib.usage_count = (existingLib.usage_count || 0) + 1;
                    await saveRecord('disease_library', existingLib);
                    val = existingLib.name;
                } else {
                    await saveRecord('disease_library', {
                        name: val,
                        usage_count: 1
                    });
                    diseaseLibrary.push({ name: val, usage_count: 1 });
                }

                showToast('Saved to Common Library', 'success');

                if (!existingDiseases.includes(val)) {
                    existingDiseases.push(val);
                }
                btnEl.style.display = 'none';

                // Check Intelligence immediately if it's the main complaint
                if (inputId === 'v_complaint') {
                    checkClinicalIntelligence(val);
                }

            } catch (e) {
                console.error(e);
                showToast('Failed to save to library', 'error');
            }
        });
    };

    // [Phase-9] Clinical Intelligence Lookups
    const checkClinicalIntelligence = async (cName) => {
        const intelPanel = document.getElementById('v_intel_panel');
        if (!cName || !intelPanel) return;

        try {
            const intelList = await getAllRecords('disease_intelligence');
            const intel = intelList.find(i => i.disease === cName.trim().toUpperCase());

            if (intel && intel.resolved_cases > 0 && intel.best_points.length > 0) {
                document.getElementById('v_intel_rate').textContent = intel.success_rate + '% Success';
                document.getElementById('v_intel_res').textContent = intel.resolved_cases;
                document.getElementById('v_intel_total').textContent = intel.total_cases;
                document.getElementById('v_intel_points').textContent = intel.best_points.join(', ');
                intelPanel.style.display = 'block';

                const useBtn = document.getElementById('btn_use_intel');
                if (useBtn) {
                    const newBtn = useBtn.cloneNode(true);
                    useBtn.parentNode.replaceChild(newBtn, useBtn);
                    newBtn.addEventListener('click', () => {
                        if (document.getElementById('v_treatment_method').value === 'ASPM Method' && document.getElementById('v_aspm_protocol_panel').style.display !== 'none') {
                            const spt = document.getElementById('aspm_p_symptom');
                            spt.value = intel.best_points.join(', ');
                            spt.dispatchEvent(new Event('input'));
                            showToast('Applied Intelligence to ASPM Symptom Points', 'info');
                        } else {
                            const ptsInput = document.getElementById('v_points_input');
                            const ptsRaw = document.getElementById('v_points');
                            if (ptsRaw) {
                                const curr = ptsRaw.value ? ptsRaw.value.split(',').map(s => s.trim()) : [];
                                const merged = [...new Set([...curr, ...intel.best_points])].join(', ');
                                ptsRaw.value = merged;
                                ptsInput.value = '';
                                if (typeof spAC !== 'undefined') { spAC.setPoints(merged); }
                                showToast('Applied Intelligence to Points Used', 'info');
                            }
                        }
                    });
                }
            } else {
                intelPanel.style.display = 'none';
            }
        } catch (err) { }
    };

    // Listen to changes gracefully
    complaintInput.addEventListener('blur', () => {
        setTimeout(() => {
            checkClinicalIntelligence(complaintInput.value);
        }, 200);
    });

    bindLibrarySaveBtn('v_complaint', 'btnAddDiseaseLibrary');
    bindLibrarySaveBtn('v_additional_complaint_input', 'btnAddAddlDiseaseLibrary');

    btnAddDiseaseMaster.addEventListener('click', () => {
        const val = complaintInput.value.trim();
        const html = `
            <div class="form-group">
                <label>English Name</label>
                <input type="text" id="new_disease_en" class="form-control" value="${escapeHtml(val)}">
            </div>
            <div class="form-group">
                <label>Malayalam Name</label>
                <input type="text" id="new_disease_ml" class="form-control" placeholder="മലയാളം">
            </div>
        `;

        // Don't close visit modal, show on top or close? HTML modal system uses single overlay.
        // I will temporarily save visit modal state.
        showModal('Add to Disease Master', html, async () => {
            const enName = document.getElementById('new_disease_en').value.trim();
            const mlName = document.getElementById('new_disease_ml').value.trim();
            if (!enName) return false;

            const newItem = mlName ? { en: enName, ml: mlName } : { en: enName, ml: '' };

            const m = await getRecord('masters', 'master_complaints');
            if (m) {
                m.list.push(newItem);
                await saveRecord('masters', m);

                existingDiseases.push(extractName(newItem));
                const datalist = document.getElementById('diseaseListOptions');
                if (datalist) {
                    safeInsertHTML(datalist, `<option value="${escapeHtml(extractName(newItem))}">`);
                } else {
                    console.warn("Phase-6C: diseaseListOptions missing preventing DOM crash");
                }

                complaintInput.value = extractName(newItem);
                btnAddDiseaseMaster.style.display = 'none';
                showToast('Added to Disease Master', 'success');
            }
            return true;
        }, 'Save Disease');
    });

    // Additional Complaints Add/Remove Logic Removed (Handled by Phase-6C.3 Chips logic)

    // 1. Toggle Electro
    document.getElementById('v_mode').addEventListener('change', (e) => {
        const elContainer = document.getElementById('electroContainer');
        if (elContainer) {
            elContainer.style.display = e.target.value === 'Electro-Acupuncture' ? 'block' : 'none';
        }
    });

    // 1.5 Toggle ASPM Panel & Logic
    const trMethodEl = document.getElementById('v_treatment_method');
    const aspmPanel = document.getElementById('v_aspm_panel');
    const chkChronic = document.getElementById('aspm_chk_chronic');
    const chkRecurrent = document.getElementById('aspm_chk_recurrent');
    const chkMultiple = document.getElementById('aspm_chk_multiple');
    const energyChks = document.querySelectorAll('.aspm-energy-chk');
    const aspmRecArea = document.getElementById('aspm_rec_area');
    const btnGenASPM = document.getElementById('btn_generate_aspm');
    const btnNoASPM = document.getElementById('btn_continue_no_aspm');

    const evaluateASPM = () => {
        const isChronic = chkChronic.checked;
        const isRecurrent = chkRecurrent.checked;
        const isMultiple = chkMultiple.checked;
        const energyCount = Array.from(energyChks).filter(c => c.checked).length;

        if (isChronic || isRecurrent || isMultiple) {
            aspmRecArea.style.display = 'block';
        } else {
            aspmRecArea.style.display = 'none';
        }
    };

    if (trMethodEl && aspmPanel) {
        trMethodEl.addEventListener('change', (e) => {
            aspmPanel.style.display = e.target.value === 'ASPM Method' ? 'block' : 'none';
        });
        // Init state
        aspmPanel.style.display = trMethodEl.value === 'ASPM Method' ? 'block' : 'none';

        [chkChronic, chkRecurrent, chkMultiple, ...energyChks].forEach(chk => {
            chk.addEventListener('change', evaluateASPM);
        });

        // Initialize Dynamic Selectors for the fields
        const rAC = initDynamicPointAutocomplete('aspm_p_root', null, pointLibrary, () => { });
        const sysAC = initDynamicPointAutocomplete('aspm_p_system', null, pointLibrary, () => { });
        const symAC = initDynamicPointAutocomplete('aspm_p_symptom', 'aspm_p_symptom_chips', pointLibrary, () => { }, true);
        const immAC = initDynamicPointAutocomplete('aspm_p_immunity', null, pointLibrary, () => { });
        const wstAC = initDynamicPointAutocomplete('aspm_p_waste', null, pointLibrary, () => { });

        // Pre-fill existing data if any
        if (visit && visit.aspm_protocol) {
            rAC.setValue(visit.aspm_protocol.root);
            sysAC.setValue(visit.aspm_protocol.system);
            symAC.setValue(visit.aspm_protocol.symptom);
            immAC.setValue(visit.aspm_protocol.immunity);
            wstAC.setValue(visit.aspm_protocol.waste);
        }

        if (btnGenASPM) {
            btnGenASPM.addEventListener('click', async () => {
                const cmp = document.getElementById('v_complaint').value;
                if (!cmp) {
                    showToast('Please enter a chief complaint first', 'warning');
                    return;
                }

                const originalText = btnGenASPM.textContent;
                btnGenASPM.textContent = "Generating...";
                btnGenASPM.disabled = true;

                try {
                    const suggestion = await generateASPM(cmp);

                    const protPanel = document.getElementById('v_aspm_protocol_panel');
                    if (protPanel) protPanel.style.display = 'block';

                    rAC.setValue(suggestion.root || '');
                    sysAC.setValue(suggestion.activation || '');
                    symAC.setValue(suggestion.symptom || '');
                    immAC.setValue(suggestion.immunity || '');
                    wstAC.setValue(suggestion.waste || '');

                    aspmRecArea.style.display = 'none';
                    showToast('ASPM Protocol Generated', 'success');
                } catch (err) {
                    console.error("Failed to generate ASPM:", err);
                    showToast('Error generating ASPM', 'error');
                } finally {
                    btnGenASPM.textContent = originalText;
                    btnGenASPM.disabled = false;
                }
            });
        }

        if (btnNoASPM) {
            btnNoASPM.addEventListener('click', () => {
                aspmRecArea.style.display = 'none';
            });
        }

        // Show the panel automatically if the protocol was previously saved
        if (visit && visit.aspm_protocol && trMethodEl.value === 'ASPM Method') {
            const protPanel = document.getElementById('v_aspm_protocol_panel');
            if (protPanel) protPanel.style.display = 'block';
        }
    }

    // Helper to get active complaints for Phase-6D Search Boost
    const getActiveComplaints = () => {
        const pid = document.getElementById('v_patient_id')?.value;
        if (!pid) return [];
        return allComplaints.filter(c => c.patient_id === pid && (c.status === 'Active' || c.status === 'Recurred' || c.status === 'improving')).map(c => c.name);
    };

    // 2. Init Chief & Additional Complaint Autocomplete
    initDiseaseAutocomplete('v_complaint', diseaseLibrary, masterNames, (val) => {
        if (typeof complaintInput !== 'undefined') {
            complaintInput.dispatchEvent(new Event('input'));
        }
        const trMethodElVal = document.getElementById('v_treatment_method')?.value;
        if (trMethodElVal === 'ASPM Method' && val) {
            const btnGen = document.getElementById('btn_generate_aspm');
            if (btnGen) btnGen.click();
        }
    }, false, null, null, getActiveComplaints);
    initDiseaseAutocomplete('v_additional_complaint_input', diseaseLibrary, masterNames, null, true, 'v_additional_complaints_chips', 'v_additional_complaints', getActiveComplaints);

    // [Phase-7C] Init Element Multi-Select Chips
    const initElementMultiSelect = () => {
        const hiddenInput = document.getElementById('v_element');
        const chipsContainer = document.getElementById('v_elements_chips');
        const buttons = document.querySelectorAll('.btn-element-toggle');

        let selectedElements = hiddenInput.value ? hiddenInput.value.split('|||').filter(Boolean) : [];

        const renderElementChips = () => {
            if (!chipsContainer) return;
            chipsContainer.innerHTML = selectedElements.map(p => `
                <span class="chip">
                    ${escapeHtml(p)}
                    <button type="button" class="chip-remove" data-val="${escapeHtml(p)}"><i class="ph ph-x"></i></button>
                </span>
            `).join('');

            // Highlight buttons that are selected
            buttons.forEach(btn => {
                if (selectedElements.includes(btn.dataset.val)) {
                    btn.style.backgroundColor = 'var(--brand-primary)';
                    btn.style.color = '#fff';
                    btn.style.borderColor = 'var(--brand-primary)';
                } else {
                    btn.style.backgroundColor = '';
                    btn.style.color = '';
                    btn.style.borderColor = '';
                }
            });

            chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const val = e.currentTarget.dataset.val;
                    selectedElements = selectedElements.filter(s => s !== val);
                    hiddenInput.value = selectedElements.join('|||');
                    renderElementChips();
                });
            });

            // [Phase-17] Trigger protocol query
            evaluateElementProtocol(selectedElements);
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                if (selectedElements.includes(val)) {
                    // Toggle off
                    selectedElements = selectedElements.filter(s => s !== val);
                } else {
                    // Toggle on
                    selectedElements.push(val);
                }
                hiddenInput.value = selectedElements.join('|||');
                renderElementChips();
            });
        });

        const evaluateElementProtocol = async (elements) => {
            const panel = document.getElementById('v_element_protocol_panel');
            if (!panel) return;

            const trMethodElVal = document.getElementById('v_treatment_method')?.value;
            if (trMethodElVal !== 'Element Pulse' || elements.length === 0) {
                panel.style.display = 'none';
                return;
            }

            // Create pattern string sorted alphabetically (e.g., "EARTH + WATER")
            const patternString = [...elements].sort().join(' + ');

            try {
                const allProtocols = await getAllRecords('element_protocol_memory');
                const matching = allProtocols.filter(p => p.imbalance_pattern === patternString);

                if (matching.length > 0) {
                    // Rank by success rate (or fallback to success count if total use is 0 padding to avoid NaN)
                    matching.sort((a, b) => {
                        const rateA = a.usage_count > 0 ? (a.success_count / a.usage_count) : 0;
                        const rateB = b.usage_count > 0 ? (b.success_count / b.usage_count) : 0;
                        return rateB - rateA; // Descending
                    });

                    const bestProtocol = matching[0];
                    const rate = bestProtocol.usage_count > 0 ? Math.round((bestProtocol.success_count / bestProtocol.usage_count) * 100) : 0;

                    document.getElementById('v_ep_pattern_name').textContent = patternString;
                    document.getElementById('v_ep_success_rate').textContent = rate + '% Success';

                    const pointsArr = bestProtocol.points.split(',').map(p => p.trim()).filter(Boolean);
                    document.getElementById('v_ep_points_box').innerHTML = pointsArr.map(p =>
                        `<span class="chip" style="background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: var(--brand-primary); padding: 4px 8px; font-size: 0.8rem; font-weight: 600;">${p}</span>`
                    ).join('');

                    document.getElementById('btn_use_ep_points').onclick = () => {
                        const ptsInput = document.getElementById('v_points_input');
                        if (typeof window.smartPointsAutocomplete !== 'undefined') {
                            window.smartPointsAutocomplete.setValue(bestProtocol.points);
                        } else {
                            ptsInput.value = bestProtocol.points;
                            document.getElementById('v_points').value = bestProtocol.points;
                        }
                    };

                    panel.style.display = 'block';
                } else {
                    panel.style.display = 'none';
                }

            } catch (e) {
                console.error("Error fetching element protocols", e);
                panel.style.display = 'none';
            }
        };

        renderElementChips(); // Initial render
        renderElementChips(); // Initial render
    };
    initElementMultiSelect();

    // [Phase-23] Init Pulse Element Multi-Select Chips
    const initPulseElementMultiSelect = () => {
        const hiddenInput = document.getElementById('v_pulse_elements');
        const chipsContainer = document.getElementById('v_pulse_elements_chips');
        const buttons = document.querySelectorAll('.btn-pulse-element-toggle');

        let selectedElements = hiddenInput.value ? hiddenInput.value.split('|||').filter(Boolean) : [];

        const renderPulseChips = () => {
            if (!chipsContainer) return;
            chipsContainer.innerHTML = selectedElements.map(p => `
                <span class="chip" style="background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.2); color: var(--brand-primary);">
                    ${escapeHtml(p)}
                    <button type="button" class="chip-remove" data-val="${escapeHtml(p)}"><i class="ph ph-x"></i></button>
                </span>
            `).join('');

            // Highlight buttons that are selected
            buttons.forEach(btn => {
                if (selectedElements.includes(btn.dataset.val)) {
                    btn.style.backgroundColor = 'var(--brand-primary)';
                    btn.style.color = '#fff';
                    btn.style.borderColor = 'var(--brand-primary)';
                } else {
                    btn.style.backgroundColor = '';
                    btn.style.color = '';
                    btn.style.borderColor = '';
                }
            });

            chipsContainer.querySelectorAll('.chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const val = e.currentTarget.dataset.val;
                    selectedElements = selectedElements.filter(s => s !== val);
                    hiddenInput.value = selectedElements.join('|||');
                    renderPulseChips();
                });
            });

            // [Phase-23] Trigger protocol query
            evaluatePulseProtocol(selectedElements);
        };

        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                if (selectedElements.includes(val)) {
                    // Toggle off
                    selectedElements = selectedElements.filter(s => s !== val);
                } else {
                    // Toggle on
                    selectedElements.push(val);
                }
                hiddenInput.value = selectedElements.join('|||');
                renderPulseChips();
            });
        });

        const evaluatePulseProtocol = async (elements) => {
            const panel = document.getElementById('v_element_protocol_panel');
            if (!panel) return;

            if (elements.length === 0) {
                // Return to Syndrome if pulse cleared, but just hiding is safer for now.
                // We show Protocol Panel if ANY pattern matches.
                // In Phase-23, Protocol Panel is shared. We only trigger Pulse if it has values.
                // If Syndrome also has values, Syndrome takes rendering precedence via its own listener if updated later.
                // Here we just hide if empty, but we probably shouldn't hide if Syndrome is active. 
                // For simplicity, we just hide.
                panel.style.display = 'none';
                return;
            }

            // Create pattern string sorted alphabetically (e.g., "EARTH + WATER")
            const patternString = [...elements].sort().join(' + ');

            try {
                const allProtocols = await getAllRecords('element_protocol_memory');
                const matching = allProtocols.filter(p => p.imbalance_pattern === patternString);

                if (matching.length > 0) {
                    matching.sort((a, b) => {
                        const rateA = a.usage_count > 0 ? (a.success_count / a.usage_count) : 0;
                        const rateB = b.usage_count > 0 ? (b.success_count / b.usage_count) : 0;
                        return rateB - rateA; // Descending
                    });

                    const bestProtocol = matching[0];
                    const rate = bestProtocol.usage_count > 0 ? Math.round((bestProtocol.success_count / bestProtocol.usage_count) * 100) : 0;

                    document.getElementById('v_ep_pattern_name').textContent = patternString;
                    document.getElementById('v_ep_success_rate').textContent = rate + '% Success';

                    const pointsArr = bestProtocol.points.split(',').map(p => p.trim()).filter(Boolean);
                    document.getElementById('v_ep_points_box').innerHTML = pointsArr.map(p =>
                        `<span class="chip" style="background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.2); color: var(--brand-primary); padding: 4px 8px; font-size: 0.8rem; font-weight: 600;">${p}</span>`
                    ).join('');

                    document.getElementById('btn_use_ep_points').onclick = () => {
                        const ptsInput = document.getElementById('v_points_input');
                        if (typeof window.smartPointsAutocomplete !== 'undefined') {
                            window.smartPointsAutocomplete.setValue(bestProtocol.points);
                        } else {
                            ptsInput.value = bestProtocol.points;
                            document.getElementById('v_points').value = bestProtocol.points;
                        }
                    };

                    panel.style.display = 'block';
                } else {
                    panel.style.display = 'none';
                }

            } catch (e) {
                console.error("Error fetching pulse protocols", e);
                panel.style.display = 'none';
            }
        };

        renderPulseChips(); // Initial render
    };
    initPulseElementMultiSelect();

    // 2. Init Smart Points Autocomplete
    const ac = initPointAutocomplete('v_points_input', 'v_points_chips', (val) => {
        document.getElementById('v_points').value = val;
    });
    // Hydrate existing
    if (visit?.points_used) ac.setPoints(visit.points_used);

    // 3. Audio Recording binding
    if (appState.featureFlags.enableVoiceRecording) {
        bindVoiceRecorder();
    }

    // [Phase-6D] Cursor Auto-Focus
    setTimeout(() => {
        const complaintInput = document.getElementById('v_complaint');
        if (complaintInput) complaintInput.focus();
    }, 100);

    // [Phase-6D] Keyboard Shortcuts
    const handleKbShortcut = (e) => {
        const overlay = document.getElementById('modalOverlay');
        if (!overlay || overlay.classList.contains('hidden')) {
            document.removeEventListener('keydown', handleKbShortcut);
            return;
        }

        const tag = document.activeElement?.tagName;
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('modalSaveBtn')?.click();
        } else if (e.key === 'Escape') {
            if (tag === 'TEXTAREA' || tag === 'INPUT') {
                document.activeElement.blur();
            } else {
                document.getElementById('modalCloseTopBtn')?.click();
            }
        }
    };
    document.addEventListener('keydown', handleKbShortcut);
};

const bindVoiceRecorder = () => {
    const micBtn = document.getElementById('micBtn');
    const timerDisplay = document.getElementById('recTimer');
    const audioPlayback = document.getElementById('audioPlayback');

    let isRecording = false;
    let seconds = 0;

    micBtn.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    audioBlobState = new Blob(audioChunks, { type: 'audio/webm' });
                    const audioUrl = URL.createObjectURL(audioBlobState);
                    audioPlayback.src = audioUrl;
                    audioPlayback.style.display = 'block';

                    // Stop tracks
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();
                isRecording = true;
                micBtn.classList.add('recording');
                micBtn.innerHTML = '<i class="ph ph-stop"></i>';

                // Timer
                seconds = 0;
                timerDisplay.textContent = '00:00';
                recordingInterval = setInterval(() => {
                    seconds++;
                    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
                    const s = (seconds % 60).toString().padStart(2, '0');
                    timerDisplay.textContent = `${m}:${s} `;
                }, 1000);

            } catch (err) {
                console.error("Mic access denied", err);
                showToast("Microphone access denied or not available", "error");
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="ph ph-microphone"></i>';
            clearInterval(recordingInterval);
        }
    });
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

// ===== Phase-6C.3 & 6E Smart Complaint Autocomplete =====

// [Phase-7] Smart Match Synonym Dictionary
const SYNONYM_MAP = {
    'migraine': ['മൈഗ്രൈൻ', 'തലവേദന'],
    'varicose veins': ['varicose', 'വാരിക്കോസ്', 'കാല് നരമ്പ്'],
    'diabetes': ['sugar', 'ഷുഗർ', 'പ്രമേഹം'],
    'blood sugar imbalance': ['sugar', 'ഷുഗർ', 'പ്രമേഹം', 'diabetes'],
    'high blood pressure': ['bp', 'ബിപി', 'pressure'],
    'headache': ['തലവേദന'],
    'lower back pain': ['back pain', 'നടുവേദന']
};

const getSynonymsString = (str) => {
    if (!str) return '';
    const n = str.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
    let syns = [];
    for (const [key, vals] of Object.entries(SYNONYM_MAP)) {
        if (key === n || vals.includes(n) || n.includes(key)) {
            syns = syns.concat(vals);
            syns.push(key);
        }
    }
    return [...new Set(syns)].join(' ');
};

// 1. Input Normalization
const normalizeString = (str) => {
    if (!str) return '';
    // [Phase-6E, Phase-7] Safe Malayalam handling using NFC
    return str.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
};

// [Phase-6E] Levenshtein Edit Distance for Typo Tolerance
const getEditDistance = (a, b) => {
    if (!a || !b) return (a || b).length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

// 2. Fuzzy Search Tolerance
const fuzzyMatch = (pattern, str) => {
    pattern = normalizeString(pattern);
    str = normalizeString(str);
    if (!pattern) return true;
    if (!str) return false;

    // Fast pass: exact or substring match
    if (str.includes(pattern)) return true;

    // Word-level typo matching
    const patternWords = pattern.split(' ');
    const strWords = str.split(' ');

    let allWordsMatch = true;
    for (const pw of patternWords) {
        let bestDist = Infinity;
        for (const sw of strWords) {
            if (sw.includes(pw)) {
                bestDist = 0;
                break;
            }
            if (Math.abs(sw.length - pw.length) > 3) continue;
            const dist = getEditDistance(pw, sw);
            if (dist < bestDist) bestDist = dist;
        }
        // Tolerance threshold: 1 typo for words < 5 chars, 2 for longer
        const maxDist = pw.length < 5 ? 1 : 2;
        if (bestDist > maxDist) {
            allWordsMatch = false;
            break;
        }
    }
    if (allWordsMatch) return true;

    // Fallback pass: Sequence match (e.g. 'mgn' matches 'migraine')
    let patternIdx = 0;
    let strIdx = 0;
    while (patternIdx < pattern.length && strIdx < str.length) {
        if (pattern[patternIdx] === str[strIdx]) {
            patternIdx++;
        }
        strIdx++;
    }
    return patternIdx === pattern.length;
};

const initDiseaseAutocomplete = (inputId, diseaseLibrary, masterNames, onSelect, isMulti = false, chipsContainerId = null, hiddenInputId = null, getActiveComplaints = null) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    let selectedItems = [];
    if (isMulti && hiddenInputId) {
        const hid = document.getElementById(hiddenInputId).value;
        if (hid) selectedItems = hid.split('|||').filter(Boolean);
    }

    const container = isMulti ? document.getElementById(chipsContainerId) : null;
    let highlightedIndex = -1;
    let currentSuggestions = [];
    let debounceTimer = null;
    let isSelecting = false; // [Phase-6E] Prevent redundant input events
    let lastRenderedHtml = ''; // [Phase-6E] Anti-flicker

    // 3. Lightweight Search Index
    // Pre-normalize library and master lists to avoid doing it on every keystroke
    const indexedLibrary = diseaseLibrary.map(d => {
        const synStr = getSynonymsString(d.name);
        return {
            ...d,
            normalized: normalizeString(d.name),
            normalizedMl: d.malayalam ? normalizeString(d.malayalam) : '',
            normalizedCombined: normalizeString(`${d.name} ${d.malayalam || ''}`),
            normalizedSynonyms: normalizeString(synStr)
        };
    });
    const indexedMasters = masterNames.map(m => ({ name: m, normalized: normalizeString(m) }));

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    input.parentNode.appendChild(dropdown);

    const renderChips = () => {
        if (!container) return;
        container.innerHTML = selectedItems.map(p => `
            <span class="chip">
                ${escapeHtml(p)}
                <button type="button" class="chip-remove" data-val="${escapeHtml(p)}"><i class="ph ph-x"></i></button>
            </span>
        `).join('');

        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                selectedItems = selectedItems.filter(s => s !== val);
                document.getElementById(hiddenInputId).value = selectedItems.join('|||');
                renderChips();
            });
        });
    };
    if (isMulti) renderChips();

    const generateHtmlForSection = (title, items) => {
        if (!items || items.length === 0) return '';
        let html = `<div class="ac-section-header">${title}</div>`;
        items.forEach(item => {
            currentSuggestions.push({ name: item.name });
            const idx = currentSuggestions.length - 1;
            const displayName = item.malayalam ? `${escapeHtml(item.name)} <span style="color:var(--text-secondary); font-size:0.85em;">/ ${escapeHtml(item.malayalam)}</span>` : escapeHtml(item.name);
            html += `<div class="ac-item ${idx === highlightedIndex ? 'highlighted' : ''}" data-idx="${idx}">${displayName}</div>`;
        });
        return html;
    };

    const renderSuggestions = (query) => {
        const q = normalizeString(query);
        let html = '';
        currentSuggestions = [];

        const activeConditionsRaw = getActiveComplaints ? getActiveComplaints() : [];
        const activeConditions = activeConditionsRaw.map(a => ({ name: a, normalized: normalizeString(a) }));

        if (q === '') {
            // Empty Search: Show Active then Most Used
            const activeToShow = activeConditions.filter(a => (!isMulti || !selectedItems.includes(a.name)));
            html += generateHtmlForSection('⭐ ACTIVE', activeToShow);

            if (!isMulti) {
                const topUsed = indexedLibrary
                    .filter(d => !activeConditions.some(a => a.normalized === d.normalized))
                    .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
                    .slice(0, 5);
                html += generateHtmlForSection('🔥 MOST USED', topUsed);
            } else if (activeToShow.length === 0) {
                if (dropdown.style.display !== 'none') dropdown.style.display = 'none';
                lastRenderedHtml = '';
                return;
            }
        } else {
            // Active Search

            // 1. ⭐ ACTIVE Matches
            const activeMatches = activeConditions.filter(a => fuzzyMatch(q, a.normalized) && (!isMulti || !selectedItems.includes(a.name)));
            html += generateHtmlForSection('⭐ ACTIVE', activeMatches);

            // 2. 🔥 MOST USED Matches (from library)
            const activeNormals = activeMatches.map(a => a.normalized);
            const libMatches = indexedLibrary
                .filter(d => (fuzzyMatch(q, d.normalized) || (d.normalizedMl && fuzzyMatch(q, d.normalizedMl)) || fuzzyMatch(q, d.normalizedCombined)) && !activeNormals.includes(d.normalized) && (!isMulti || !selectedItems.includes(d.name)))
                .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)) // Rank by usage
                .slice(0, 5);
            html += generateHtmlForSection('🔥 MOST USED', libMatches);

            // 3. 🧠 SMART MATCH (Synonym matches from library)
            const libNormals = libMatches.map(l => l.normalized);
            const smartMatches = indexedLibrary
                .filter(d => fuzzyMatch(q, d.normalizedSynonyms) && !activeNormals.includes(d.normalized) && !libNormals.includes(d.normalized) && (!isMulti || !selectedItems.includes(d.name)))
                .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
                .slice(0, 5);
            html += generateHtmlForSection('🧠 SMART MATCH', smartMatches);

            // 4. 📚 LIBRARY RESULTS Matches
            const smartNormals = smartMatches.map(s => s.normalized);
            const masterMatches = indexedMasters
                .filter(m => fuzzyMatch(q, m.normalized) && !activeNormals.includes(m.normalized) && !libNormals.includes(m.normalized) && !smartNormals.includes(m.normalized) && !indexedLibrary.some(d => d.normalized === m.normalized) && (!isMulti || !selectedItems.includes(m.name)))
                .slice(0, 5); // Fallback, no specific sorting needed beyond original list order
            html += generateHtmlForSection('📚 LIBRARY RESULTS', masterMatches);
        }

        if (currentSuggestions.length === 0) {
            html = `<div class="ac-empty">No records found. Type to add a new one.</div>`;
        }

        // [Phase-6E] Anti-flicker: Only update DOM if HTML actually changed
        if (lastRenderedHtml !== html) {
            dropdown.innerHTML = html;
            lastRenderedHtml = html;

            dropdown.querySelectorAll('.ac-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.idx, 10);
                    selectItem(currentSuggestions[idx].name);
                });
                item.addEventListener('mouseenter', (e) => {
                    dropdown.querySelectorAll('.ac-item').forEach(i => i.classList.remove('highlighted'));
                    e.currentTarget.classList.add('highlighted');
                    highlightedIndex = parseInt(e.currentTarget.dataset.idx, 10);
                });
            });
        }

        if (dropdown.style.display !== 'block') {
            dropdown.style.display = 'block';
        }
    };

    const selectItem = (val) => {
        isSelecting = true;
        if (isMulti) {
            if (!selectedItems.includes(val)) {
                selectedItems.push(val);
                document.getElementById(hiddenInputId).value = selectedItems.join('|||');
                renderChips();
            }
            input.value = '';

            // Re-render empty state to show updated active list minus selected
            highlightedIndex = -1;
            renderSuggestions('');

            input.dispatchEvent(new Event('input'));
            input.focus();
        } else {
            input.value = val;
            dropdown.style.display = 'none';
            lastRenderedHtml = '';
            if (onSelect) onSelect(val);
        }
        setTimeout(() => isSelecting = false, 0); // Allow current event loop to finish
    };

    input.addEventListener('input', (e) => {
        if (isSelecting) return;
        highlightedIndex = -1;
        // 4. Keyboard Debounce (~120ms)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderSuggestions(e.target.value);
        }, 120);

        if (!isMulti && onSelect) onSelect(e.target.value);
    });

    input.addEventListener('focus', () => {
        if (dropdown.style.display === 'none') {
            highlightedIndex = -1;
            renderSuggestions(input.value);
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentSuggestions.length > 0) {
                highlightedIndex = (highlightedIndex + 1) % currentSuggestions.length;
                renderSuggestions(input.value);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentSuggestions.length > 0) {
                highlightedIndex = (highlightedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
                renderSuggestions(input.value);
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < currentSuggestions.length) {
                selectItem(currentSuggestions[highlightedIndex].name);
            } else if (input.value.trim() !== '') {
                selectItem(input.value.trim());
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            // Custom blur reset logic for element (if it were injected here, handled globally inside select logic)
        }
    });
};

// ===== Phase-6C SAFE UI HELPER =====
function safeInsertHTML(target, html) {
    if (!target) {
        console.warn("Phase-6C: target not found for insertAdjacentHTML");
        return;
    }
    target.insertAdjacentHTML("beforeend", html);
}