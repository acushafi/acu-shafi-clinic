import { getAllRecords, saveRecord, deleteRecord, getRecord } from '../db.js';
import { showToast, showModal } from '../ui.js';

export const renderSchemesView = async (container) => {
    container.innerHTML = `
        <div class="view-header">
            <h3>Treatment Schemes (Packages)</h3>
            <div class="view-actions">
                <button class="primary-btn" id="addSchemeBtn"><i class="ph ph-plus"></i> Add Scheme</button>
            </div>
        </div>

        <div class="table-container">
            <table class="data-table" id="schemesTable">
                <thead>
                    <tr>
                        <th>Scheme Name</th>
                        <th>Price (₹)</th>
                        <th>Paid Sessions</th>
                        <th>Bonus Sessions</th>
                        <th>Total Sessions</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="schemesListBody">
                    <tr><td colspan="6" class="text-center"><i class="ph ph-spinner spin"></i> Loading schemes...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('addSchemeBtn').addEventListener('click', () => openSchemeModal());

    await loadSchemes();
};

const loadSchemes = async () => {
    const tbody = document.getElementById('schemesListBody');
    if (!tbody) return;

    try {
        const schemes = await getAllRecords('schemes');

        schemes.sort((a, b) => (b.created_date || 0) - (a.created_date || 0));

        if (schemes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-state"><p>No schemes created yet.</p></td></tr>`;
            return;
        }

        tbody.innerHTML = schemes.map(s => `
            <tr>
                <td style="font-weight: 600;">${escapeHtml(s.scheme_name)}</td>
                <td style="color: var(--success); font-weight: 600;">₹${parseFloat(s.price).toFixed(2)}</td>
                <td>${s.paid_sessions}</td>
                <td><span class="badge badge-neutral">${s.bonus_sessions}</span></td>
                <td><strong>${s.total_sessions}</strong></td>
                <td class="action-cells">
                    <button class="icon-btn action-edit" data-id="${s.id}" title="Edit Scheme"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn danger-text action-delete" data-id="${s.id}" data-name="${escapeHtml(s.scheme_name)}" title="Delete Scheme"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.action-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const scheme = await getRecord('schemes', id);
                if (scheme) openSchemeModal(scheme);
            });
        });

        tbody.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const name = e.currentTarget.dataset.name;

                if (confirm(`Delete scheme "${name}"?\n\nThis will NOT affect patients currently assigned to it, but you won't be able to assign it to new patients.`)) {
                    await deleteRecord('schemes', id);
                    showToast('Scheme deleted', 'success');
                    loadSchemes();
                }
            });
        });

    } catch (e) {
        console.error(e);
        showToast('Error loading schemes', 'error');
        tbody.innerHTML = '<tr><td colspan="6" class="text-center error-text">Failed to load data.</td></tr>';
    }
};

const openSchemeModal = (scheme = null) => {
    const isEdit = !!scheme;
    const title = isEdit ? 'Edit Scheme' : 'Add New Scheme';

    const sId = scheme?.id || '';
    const sName = escapeHtml(scheme?.scheme_name || '');
    const sPrice = scheme?.price || '';
    const sPaid = scheme?.paid_sessions || 0;
    const sBonus = scheme?.bonus_sessions || 0;
    const sTotal = (parseInt(sPaid) || 0) + (parseInt(sBonus) || 0);

    const formHtml = `
        <form id="schemeForm" class="standard-form">
            <input type="hidden" id="sch_id" value="${sId}">
            
            <div class="form-group">
                <label>Scheme Name *</label>
                <input type="text" id="sch_name" class="form-control" required placeholder="e.g. Silver Plan" value="${sName}">
            </div>
            
            <div class="form-group">
                <label>Price (₹) *</label>
                <input type="number" step="0.01" id="sch_price" class="form-control" required value="${sPrice}">
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Paid Sessions *</label>
                    <input type="number" id="sch_paid" class="form-control" required value="${sPaid}">
                </div>
                <div class="form-group">
                    <label>Bonus Sessions *</label>
                    <input type="number" id="sch_bonus" class="form-control" required value="${sBonus}">
                </div>
            </div>
            
            <div class="form-group" style="background: var(--bg-surface-hover); padding: 12px; border-radius: var(--border-radius-sm); margin-top: 8px;">
                <label style="margin-bottom: 4px; color: var(--text-secondary);">Total Sessions</label>
                <div id="sch_total_display" style="font-size: 1.5rem; font-weight: 700; color: var(--brand-primary);">${sTotal}</div>
            </div>
        </form>
    `;

    showModal(title, formHtml, async () => {
        const name = document.getElementById('sch_name').value.trim();
        const price = document.getElementById('sch_price').value;
        const paid = document.getElementById('sch_paid').value;
        const bonus = document.getElementById('sch_bonus').value;

        if (!name || isNaN(parseFloat(price)) || isNaN(parseInt(paid)) || isNaN(parseInt(bonus))) {
            showToast('Please fill out all fields correctly', 'warning');
            return false;
        }

        const paidInt = parseInt(paid, 10);
        const bonusInt = parseInt(bonus, 10);

        const record = {
            id: document.getElementById('sch_id').value || undefined,
            scheme_name: name,
            price: parseFloat(price),
            paid_sessions: paidInt,
            bonus_sessions: bonusInt,
            total_sessions: paidInt + bonusInt,
            created_date: scheme ? scheme.created_date : Date.now()
        };

        try {
            await saveRecord('schemes', record);
            showToast('Scheme saved successfully', 'success');
            loadSchemes();
            return true;
        } catch (e) {
            console.error(e);
            throw new Error('Database Error');
        }
    });

    setTimeout(() => {
        const paidEl = document.getElementById('sch_paid');
        const bonusEl = document.getElementById('sch_bonus');
        const displayEl = document.getElementById('sch_total_display');

        const updateDisplay = () => {
            const sum = (parseInt(paidEl.value) || 0) + (parseInt(bonusEl.value) || 0);
            displayEl.textContent = sum;
        };

        paidEl.addEventListener('input', updateDisplay);
        bonusEl.addEventListener('input', updateDisplay);
        document.getElementById('sch_name')?.focus();
    }, 100);
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
