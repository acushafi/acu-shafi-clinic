import { getAllRecords, saveRecord, deleteRecord, getRecord } from '../db.js';
import { showToast, showModal } from '../ui.js';

export const renderPaymentsView = async (container) => {
    container.innerHTML = `
        <div class="view-header">
            <h3>Payments & Billing</h3>
            <div class="view-actions">
                <div class="search-box">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" id="paymentSearchInput" placeholder="Search by patient...">
                </div>
                <button class="primary-btn" id="addPaymentBtn"><i class="ph ph-currency-circle-dollar"></i> Receive Payment</button>
            </div>
        </div>
        
        <!-- Summary Dashboard (Simple) -->
        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); flex: 1;">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Total Collected (All Time)</p>
                <h3 id="totalCollectedField" style="font-size: 1.5rem; color: var(--success); margin-top: 8px;">₹0.00</h3>
            </div>
        </div>

        <div class="table-container">
            <table class="data-table" id="paymentsTable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Patient</th>
                        <th>Amount</th>
                        <th>Mode</th>
                        <th>Notes</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="paymentsListBody">
                    <tr><td colspan="6" class="text-center"><i class="ph ph-spinner spin"></i> Loading payments...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('addPaymentBtn').addEventListener('click', () => openPaymentModal());
    document.getElementById('paymentSearchInput').addEventListener('input', (e) => loadPayments(e.target.value));

    await loadPayments();
};

const loadPayments = async (searchQuery = '') => {
    const tbody = document.getElementById('paymentsListBody');
    if (!tbody) return;

    try {
        const payments = await getAllRecords('payments');
        const patients = await getAllRecords('patients');
        const patientMap = patients.reduce((acc, p) => ({ ...acc, [p.id]: p.patient_id ? `[${p.patient_id}] ${p.name}` : p.name }), {});

        let filtered = payments;
        let grandTotal = 0;

        // Calculate grand total from all valid payments
        payments.forEach(p => {
            grandTotal += (parseFloat(p.amount) || 0);
        });

        document.getElementById('totalCollectedField').textContent = `₹${grandTotal.toFixed(2)}`;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = payments.filter(v => {
                const pName = patientMap[v.patient_id] || 'Unknown';
                return pName.toLowerCase().includes(q) || (v.mode && v.mode.toLowerCase().includes(q));
            });
        }

        // Sort by date DESC
        filtered.sort((a, b) => b.date - a.date);

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-state"><p>No payments found.</p></td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td><strong>${new Date(p.date).toLocaleDateString()}</strong></td>
                <td>${escapeHtml(patientMap[p.patient_id] || 'Unknown Patient')}</td>
                <td style="color: var(--success); font-weight: 600;">₹${parseFloat(p.amount).toFixed(2)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(p.mode || 'Cash')}</span></td>
                <td><small>${escapeHtml(p.notes || '-')}</small></td>
                <td class="action-cells">
                    <button class="icon-btn action-edit" data-id="${p.id}" title="Edit Payment"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn danger-text action-delete" data-id="${p.id}" title="Delete"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.action-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const payment = await getRecord('payments', id);
                if (payment) openPaymentModal(payment);
            });
        });

        tbody.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Delete this payment record? This will affect totals.')) {
                    await deleteRecord('payments', id);
                    showToast('Payment deleted', 'success');
                    loadPayments(document.getElementById('paymentSearchInput').value);
                }
            });
        });

    } catch (e) {
        console.error(e);
        showToast('Error loading payments', 'error');
        tbody.innerHTML = `<tr><td colspan="6" class="text-center error-text">Failed to load data.</td></tr>`;
    }
};

const openPaymentModal = async (payment = null) => {
    const isEdit = !!payment;
    const title = isEdit ? 'Edit Payment' : 'Receive Payment';

    // Fetch patients for dropdown
    const patients = await getAllRecords('patients');
    const patientOptions = patients.map(p =>
        `<option value="${p.id}" ${payment?.patient_id === p.id ? 'selected' : ''}>${escapeHtml(p.patient_id ? `[${p.patient_id}] ` + p.name : p.name)}</option>`
    ).join('');

    const todayStr = new Date().toISOString().split('T')[0];
    const dateStr = payment?.date ? new Date(payment.date).toISOString().split('T')[0] : todayStr;

    const formHtml = `
        <form id="paymentForm" class="standard-form">
            <input type="hidden" id="pay_id" value="${payment?.id || ''}">
            
            <div class="form-group">
                <label>Patient *</label>
                <select id="pay_patient_id" class="form-control" required ${isEdit ? 'disabled' : ''}>
                    <option value="">-- Select Patient --</option>
                    ${patientOptions}
                </select>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" id="pay_date" class="form-control" required value="${dateStr}">
                </div>
                <div class="form-group">
                    <label>Amount (₹) *</label>
                    <input type="number" step="0.01" id="pay_amount" class="form-control" required value="${payment?.amount || ''}">
                </div>
            </div>

            <div class="form-group">
                <label>Payment Mode</label>
                <select id="pay_mode" class="form-control">
                    <option value="Cash" ${payment?.mode === 'Cash' ? 'selected' : ''}>Cash</option>
                    <option value="UPI" ${payment?.mode === 'UPI' ? 'selected' : ''}>UPI / GPay</option>
                    <option value="Card" ${payment?.mode === 'Card' ? 'selected' : ''}>Credit/Debit Card</option>
                    <option value="Bank Transfer" ${payment?.mode === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
                </select>
            </div>

            <div class="form-group">
                <label>Notes</label>
                <input type="text" id="pay_notes" class="form-control" placeholder="e.g. Session 1 of 5" value="${escapeHtml(payment?.notes || '')}">
            </div>
        </form>
    `;

    showModal(title, formHtml, async () => {
        const patientId = document.getElementById('pay_patient_id').value;
        const oDateStr = document.getElementById('pay_date').value;
        const amount = document.getElementById('pay_amount').value;

        if (!patientId || !oDateStr || !amount) {
            showToast('Patient, Date, and Amount are required', 'warning');
            return false;
        }

        const record = {
            id: document.getElementById('pay_id').value || undefined,
            patient_id: patientId,
            date: new Date(oDateStr).getTime(),
            amount: parseFloat(amount),
            mode: document.getElementById('pay_mode').value,
            notes: document.getElementById('pay_notes').value.trim()
        };

        try {
            await saveRecord('payments', record);
            showToast(`Payment ${isEdit ? 'updated' : 'recorded'} successfully`, 'success');
            loadPayments(document.getElementById('paymentSearchInput')?.value || '');
            return true;
        } catch (e) {
            console.error(e);
            throw new Error('Database Error');
        }
    });

    setTimeout(() => document.getElementById('pay_amount')?.focus(), 100);
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
