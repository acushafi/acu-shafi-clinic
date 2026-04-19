import { getAllRecords, saveRecord, deleteRecord, getRecord } from '../db.js';
import { showToast, showModal } from '../ui.js';

export const renderExpensesView = async (container) => {
    container.innerHTML = `
        <div class="view-header">
            <h3>Expense Management</h3>
            <div class="view-actions">
                <div class="search-box">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" id="expenseSearchInput" placeholder="Search expenses...">
                </div>
                <button class="primary-btn" id="addExpenseBtn"><i class="ph ph-plus"></i> Add Expense</button>
            </div>
        </div>
        
        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); flex: 1;">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Total Expenses This Month</p>
                <h3 id="monthlyExpensesSum" style="font-size: 1.5rem; color: var(--error); margin-top: 8px;">₹0.00</h3>
            </div>
        </div>

        <div class="table-container">
            <table class="data-table" id="expensesTable">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Mode</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="expensesListBody">
                    <tr><td colspan="7" class="text-center"><i class="ph ph-spinner spin"></i> Loading expenses...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('addExpenseBtn').addEventListener('click', () => openExpenseModal());
    document.getElementById('expenseSearchInput').addEventListener('input', (e) => loadExpenses(e.target.value));

    await loadExpenses();
};

const loadExpenses = async (searchQuery = '') => {
    const tbody = document.getElementById('expensesListBody');
    if (!tbody) return;

    try {
        const expenses = await getAllRecords('expenses');

        // Calculate monthly total
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let monthlyTotal = 0;
        expenses.forEach(e => {
            const d = new Date(e.date);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                monthlyTotal += (parseFloat(e.amount) || 0);
            }
        });
        document.getElementById('monthlyExpensesSum').textContent = `₹${monthlyTotal.toFixed(2)}`;

        let filtered = expenses;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = expenses.filter(e => {
                return (e.category && e.category.toLowerCase().includes(q)) ||
                    (e.description && e.description.toLowerCase().includes(q)) ||
                    (e.id && e.id.toLowerCase().includes(q));
            });
        }

        // Sort by date DESC
        filtered.sort((a, b) => b.date - a.date);

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center empty-state"><p>No expenses found.</p></td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(e => `
            <tr>
                <td><small style="color: var(--text-tertiary);">${escapeHtml(e.id)}</small></td>
                <td><strong>${new Date(e.date).toLocaleDateString()}</strong></td>
                <td><span class="badge badge-neutral">${escapeHtml(e.category)}</span></td>
                <td>${escapeHtml(e.description || '-')}</td>
                <td style="color: var(--error); font-weight: 600;">₹${parseFloat(e.amount).toFixed(2)}</td>
                <td>${escapeHtml(e.payment_mode || 'Cash')}</td>
                <td class="action-cells">
                    <button class="icon-btn action-edit" data-internal-id="${e.id}" title="Edit Expense"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn danger-text action-delete" data-internal-id="${e.id}" title="Delete"><i class="ph ph-trash"></i></button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.action-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.internalId;
                const expense = await getRecord('expenses', id);
                if (expense) openExpenseModal(expense);
            });
        });

        tbody.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.internalId;
                if (confirm('Delete this expense record? This will affect totals.')) {
                    await deleteRecord('expenses', id);
                    showToast('Expense deleted', 'success');
                    loadExpenses(document.getElementById('expenseSearchInput').value);
                }
            });
        });

    } catch (err) {
        console.error(err);
        showToast('Error loading expenses', 'error');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center error-text">Failed to load data.</td></tr>`;
    }
};

const openExpenseModal = async (expense = null) => {
    const isEdit = !!expense;
    const title = isEdit ? 'Edit Expense' : 'Add Expense';

    const todayStr = new Date().toISOString().split('T')[0];
    const dateStr = expense?.date ? new Date(expense.date).toISOString().split('T')[0] : todayStr;

    const categories = ['Rent', 'Electricity', 'Needles', 'Cotton', 'Oils', 'Equipment', 'Maintenance', 'Marketing', 'Other'];
    const catOptions = categories.map(c => `<option value="${c}" ${expense?.category === c ? 'selected' : ''}>${c}</option>`).join('');

    const formHtml = `
        <form id="expenseForm" class="standard-form">
            <input type="hidden" id="exp_internal_id" value="${expense?.id || ''}">
            
            <div class="form-row">
                <div class="form-group">
                    <label>Date *</label>
                    <input type="date" id="exp_date" class="form-control" required value="${dateStr}">
                </div>
                <div class="form-group">
                    <label>Category *</label>
                    <select id="exp_category" class="form-control" required>
                        <option value="">-- Select Category --</option>
                        ${catOptions}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label>Description *</label>
                <input type="text" id="exp_description" class="form-control" required placeholder="e.g. Clinic rent for March" value="${escapeHtml(expense?.description || '')}">
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Amount (₹) *</label>
                    <input type="number" step="0.01" id="exp_amount" class="form-control" required value="${expense?.amount || ''}">
                </div>
                <div class="form-group">
                    <label>Payment Mode *</label>
                    <select id="exp_mode" class="form-control" required>
                        <option value="Cash" ${expense?.payment_mode === 'Cash' ? 'selected' : ''}>Cash</option>
                        <option value="Online" ${expense?.payment_mode === 'Online' ? 'selected' : ''}>Online (UPI/Bank)</option>
                    </select>
                </div>
            </div>
        </form>
    `;

    showModal(title, formHtml, async () => {
        const dateVal = document.getElementById('exp_date').value;
        const catVal = document.getElementById('exp_category').value;
        const descVal = document.getElementById('exp_description').value.trim();
        const amtVal = document.getElementById('exp_amount').value;
        const modeVal = document.getElementById('exp_mode').value;

        if (!dateVal || !catVal || !descVal || !amtVal) {
            showToast('Please fill all required fields', 'warning');
            return false;
        }

        let recordId = document.getElementById('exp_internal_id').value;

        if (!recordId) {
            // Generate ID: EXP-XXXX
            const allExp = await getAllRecords('expenses');
            let maxNum = 0;
            allExp.forEach(ex => {
                if (ex.id && ex.id.startsWith('EXP-')) {
                    const num = parseInt(ex.id.substring(4), 10);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                }
            });
            recordId = `EXP-${String(maxNum + 1).padStart(4, '0')}`;
        }

        const record = {
            id: recordId,
            date: new Date(dateVal).getTime(),
            category: catVal,
            description: descVal,
            amount: parseFloat(amtVal),
            payment_mode: modeVal,
            created_at: expense?.created_at || Date.now()
        };

        try {
            await saveRecord('expenses', record);
            showToast(`Expense ${isEdit ? 'updated' : 'added'} successfully`, 'success');
            loadExpenses(document.getElementById('expenseSearchInput')?.value || '');
            return true;
        } catch (e) {
            console.error(e);
            showToast('Database Error', 'error');
            return false;
        }
    });

    setTimeout(() => document.getElementById('exp_amount')?.focus(), 100);
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
