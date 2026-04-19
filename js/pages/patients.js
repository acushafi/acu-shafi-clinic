import { getAllRecords, saveRecord, deleteRecord, getRecord } from '../db.js';
import { showToast, showModal, hideModal } from '../ui.js';

export const renderPatientsView = async (container) => {
    container.innerHTML = `
        <div class="view-header">
            <h3>Patients Directory</h3>
            <div class="view-actions">
                <div class="search-box">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" id="patientSearchInput" placeholder="Search patients...">
                </div>
                <button class="primary-btn" id="addPatientBtn"><i class="ph ph-user-plus"></i> Add Patient</button>
            </div>
        </div>
        <div class="table-container">
            <table class="data-table" id="patientsTable">
                <thead>
                    <tr>
                        <th>Patient ID</th>
                        <th>Name & Age</th>
                        <th>Phone</th>
                        <th>Last Visit</th>
                        <th>Total Visits</th>
                        <th>Active Diseases</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="patientsListBody">
                    <tr><td colspan="6" class="text-center"><i class="ph ph-spinner spin"></i> Loading patients...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('addPatientBtn').addEventListener('click', () => openPatientModal());
    document.getElementById('patientSearchInput').addEventListener('input', (e) => loadPatients(e.target.value));

    await loadPatients();
};

const loadPatients = async (searchQuery = '') => {
    const tbody = document.getElementById('patientsListBody');
    if (!tbody) return;

    try {
        const patients = await getAllRecords('patients');
        const visits = await getAllRecords('visits');
        const complaints = await getAllRecords('complaints');

        let filtered = patients;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = patients.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.phone && p.phone.includes(q)) ||
                (p.patient_id && p.patient_id.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center empty-state"><i class="ph ph-users"></i><p>No patients found.</p></td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(p => {
            const pVisits = visits.filter(v => v.patient_id === p.id).sort((a, b) => b.date - a.date);
            const totalVisits = pVisits.length;
            const lastVisitDate = totalVisits > 0 ? new Date(pVisits[0].date).toLocaleDateString() : '-';

            const activeComplaints = complaints.filter(c => c.patient_id === p.id && c.status !== 'Resolved');
            const activeDiseases = activeComplaints.map(c => c.name).join(', ') || '-';

            return `
            <tr>
                <td><strong>${p.patient_id ? escapeHtml(p.patient_id) : '-'}</strong></td>
                <td><strong>${escapeHtml(p.name)}</strong><br><small class="text-tertiary">${p.gender || '-'} | Age ${p.age || '-'}</small></td>
                <td>${escapeHtml(p.phone || '-')}</td>
                <td>${lastVisitDate}</td>
                <td><span class="badge badge-neutral">${totalVisits}</span></td>
                <td><small>${escapeHtml(activeDiseases)}</small></td>
                <td><span class="badge ${p.status === 'active' ? 'badge-success' : 'badge-neutral'}">${p.status || 'active'}</span></td>
                <td class="action-cells">
                    <a href="#patient/${p.id}" class="icon-btn" title="View Profile" style="color: var(--brand-primary);"><i class="ph ph-user-circle"></i></a>
                    <button class="icon-btn action-edit" data-id="${p.id}" title="Edit Patient"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn danger-text action-delete" data-id="${p.id}" title="Delete"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');

        // Attach View/Edit/Delete Evts
        tbody.querySelectorAll('.action-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const patient = await getRecord('patients', id);
                if (patient) openPatientModal(patient);
            });
        });

        tbody.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Are you sure you want to delete this patient? (Soft Delete)')) {
                    await deleteRecord('patients', id);
                    showToast('Patient deleted', 'success');
                    loadPatients(document.getElementById('patientSearchInput').value);
                }
            });
        });

    } catch (e) {
        console.error(e);
        showToast('Error loading patients', 'error');
        tbody.innerHTML = `<tr><td colspan="6" class="text-center error-text">Failed to load data.</td></tr>`;
    }
};

const openPatientModal = (patient = null) => {
    const isEdit = !!patient;
    const title = isEdit ? 'Edit Patient' : 'Add New Patient';

    const formHtml = `
        <form id="patientForm" class="standard-form">
            <input type="hidden" id="p_id" value="${patient?.id || ''}">
            <div class="form-row">
                <div class="form-group" style="flex: 1;">
                    <label>Patient ID</label>
                    <input type="text" class="form-control" value="${patient?.patient_id || 'Auto-generated'}" disabled>
                </div>
                <div class="form-group" style="flex: 2;">
                    <label>Full Name *</label>
                    <input type="text" id="p_name" required class="form-control" value="${escapeHtml(patient?.name || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Age</label>
                    <input type="number" id="p_age" class="form-control" value="${patient?.age || ''}">
                </div>
                <div class="form-group">
                    <label>Gender</label>
                    <select id="p_gender" class="form-control">
                        <option value="">Select...</option>
                        <option value="Male" ${patient?.gender === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${patient?.gender === 'Female' ? 'selected' : ''}>Female</option>
                        <option value="Other" ${patient?.gender === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" id="p_phone" class="form-control" value="${escapeHtml(patient?.phone || '')}">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="p_status" class="form-control">
                        <option value="active" ${patient?.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="inactive" ${patient?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Location / Address</label>
                <input type="text" id="p_location" class="form-control" value="${escapeHtml(patient?.location || '')}">
            </div>
            ${!isEdit ? `
             <div class="form-group" style="display:none;">
                <label>First Visit Date</label>
                <input type="date" id="p_first_visit" class="form-control" value="${new Date().toISOString().split('T')[0]}">
             </div>
            ` : ''}
        </form>
    `;

    showModal(title, formHtml, async () => {
        // Validation
        const nameInput = document.getElementById('p_name');
        if (!nameInput.value.trim()) {
            showToast('Name is required', 'warning');
            nameInput.focus();
            return false; // Prevent close
        }

        // Gather data
        const idVal = document.getElementById('p_id').value || undefined;
        const record = {
            id: idVal,
            name: document.getElementById('p_name').value.trim(),
            age: document.getElementById('p_age').value || null,
            gender: document.getElementById('p_gender').value,
            phone: document.getElementById('p_phone').value.trim(),
            location: document.getElementById('p_location').value.trim(),
            status: document.getElementById('p_status').value
        };

        if (patient && patient.patient_id) {
            record.patient_id = patient.patient_id;
        } else {
            const allPats = await getAllRecords('patients');
            let maxIdNum = 0;
            allPats.forEach(p => {
                if (p.patient_id && p.patient_id.startsWith('ACU-')) {
                    const num = parseInt(p.patient_id.replace('ACU-', ''), 10);
                    if (!isNaN(num) && num > maxIdNum) maxIdNum = num;
                }
            });
            record.patient_id = `ACU-${String(maxIdNum + 1).padStart(4, '0')}`;
        }

        const allPatsForCheck = await getAllRecords('patients');
        const duplicate = allPatsForCheck.find(p =>
            p.id !== record.id &&
            p.name.toLowerCase().trim() === record.name.toLowerCase() &&
            p.age == record.age &&
            (p.location || '').toLowerCase().trim() === record.location.toLowerCase()
        );

        if (duplicate) {
            if (!confirm("Possible duplicate patient detected. Continue?")) {
                return false;
            }
        }

        const fvInput = document.getElementById('p_first_visit');
        if (fvInput) record.first_visit = new Date(fvInput.value).getTime();

        try {
            await saveRecord('patients', record);
            showToast(`Patient ${isEdit ? 'updated' : 'added'} successfully`, 'success');
            loadPatients(document.getElementById('patientSearchInput')?.value || '');
            return true;
        } catch (e) {
            console.error(e);
            throw new Error('Database Error');
        }
    }, 'Save', 'lg');

    // Auto focus name
    setTimeout(() => document.getElementById('p_name')?.focus(), 100);
};

// Utils
const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return (unsafe || "").toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};
