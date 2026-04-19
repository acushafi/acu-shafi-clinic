import { getAllRecords } from '../db.js';

export const renderFinanceView = async (container) => {
    container.innerHTML = `
        <div class="view-header">
            <h3>Finance Dashboard</h3>
        </div>
        
        <div id="financeLoading">
            <div class="text-center" style="padding: 40px;">
                <i class="ph ph-spinner spin" style="font-size: 2rem; color: var(--brand-primary);"></i>
                <p>Calculating Financials...</p>
            </div>
        </div>

        <div id="financeContent" style="display: none;">
            
            <h4 style="margin-bottom: 16px; color: var(--text-secondary);">Today's Overview</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;" id="todayCards">
                <!-- Injected Today cards -->
            </div>

            <h4 style="margin-bottom: 16px; color: var(--text-secondary);">Monthly Overview (Current Month)</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;" id="monthlyCards">
                <!-- Injected Monthly cards -->
            </div>
            
            <div id="privateFundsSection" style="display: none;">
                <h4 style="margin-bottom: 16px; color: var(--brand-secondary);"><i class="ph ph-hand-heart"></i> Shafi Private Funds (Today)</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;" id="privateCards">
                    <!-- Injected Private cards -->
                </div>
            </div>

        </div>
    `;

    await calculateAndRenderFinance();
};

const calculateAndRenderFinance = async () => {
    try {
        const payments = await getAllRecords('payments');
        const visits = await getAllRecords('visits');
        const expenses = await getAllRecords('expenses');

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Standard metrics
        let todayIncome = 0;
        let monthlyIncome = 0;
        let monthlyExpenses = 0;
        let paidVisitsToday = 0;
        let bonusVisitsToday = 0;

        payments.forEach(p => {
            const d = new Date(p.date);
            const amt = parseFloat(p.amount) || 0;

            // Check if this month
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                monthlyIncome += amt;
            }

            // Check if today
            if (p.date >= startOfDay && p.date <= endOfDay) {
                todayIncome += amt;
                paidVisitsToday++;
            }
        });

        expenses.forEach(e => {
            const d = new Date(e.date);
            const amt = parseFloat(e.amount) || 0;

            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                monthlyExpenses += amt;
            }
        });

        visits.forEach(v => {
            // Check if today
            if (v.date >= startOfDay && v.date <= endOfDay) {
                if (v.payment_type === 'Bonus') {
                    bonusVisitsToday++;
                }
            }
        });

        const netProfit = monthlyIncome - monthlyExpenses;

        // Render Today
        const todayCardsHTML = `
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border-left: 4px solid var(--success);">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Today Income</p>
                <h3 style="font-size: 1.5rem; color: var(--success); margin-top: 8px;">₹${todayIncome.toFixed(2)}</h3>
            </div>
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border-left: 4px solid var(--brand-primary);">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Paid Visits Today</p>
                <h3 style="font-size: 1.5rem; color: var(--text-primary); margin-top: 8px;">${paidVisitsToday}</h3>
            </div>
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border-left: 4px solid var(--info);">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Bonus Visits Today</p>
                <h3 style="font-size: 1.5rem; color: var(--text-primary); margin-top: 8px;">${bonusVisitsToday}</h3>
            </div>
        `;

        // Render Monthly
        const monthlyCardsHTML = `
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border-left: 4px solid var(--success);">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Monthly Income</p>
                <h3 style="font-size: 1.5rem; color: var(--success); margin-top: 8px;">₹${monthlyIncome.toFixed(2)}</h3>
            </div>
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border-left: 4px solid var(--error);">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Monthly Expenses</p>
                <h3 style="font-size: 1.5rem; color: var(--error); margin-top: 8px;">₹${monthlyExpenses.toFixed(2)}</h3>
            </div>
            <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border-left: 4px solid ${netProfit >= 0 ? 'var(--brand-primary)' : 'var(--error)'};">
                <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Net Profit</p>
                <h3 style="font-size: 1.5rem; color: ${netProfit >= 0 ? 'var(--brand-primary)' : 'var(--error)'}; margin-top: 8px;">₹${netProfit.toFixed(2)}</h3>
            </div>
        `;

        document.getElementById('todayCards').innerHTML = todayCardsHTML;
        document.getElementById('monthlyCards').innerHTML = monthlyCardsHTML;

        // Private Features
        const clinicMode = localStorage.getItem('acuclinic_mode') || 'standard';

        if (clinicMode === 'shafi_private') {
            const charityFund = todayIncome * 0.05;
            const asmaulFund = paidVisitsToday * 10;

            const privateCardsHTML = `
                <div style="background: rgba(236, 72, 153, 0.05); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--brand-secondary);">
                    <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Charity Fund (5%)</p>
                    <h3 style="font-size: 1.5rem; color: var(--brand-secondary); margin-top: 8px;">₹${charityFund.toFixed(2)}</h3>
                </div>
                <div style="background: rgba(236, 72, 153, 0.05); padding: 16px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); border: 1px solid var(--brand-secondary);">
                    <p style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Asmaul Husna Fund</p>
                    <h3 style="font-size: 1.5rem; color: var(--brand-secondary); margin-top: 8px;">₹${asmaulFund.toFixed(2)}</h3>
                </div>
            `;
            document.getElementById('privateCards').innerHTML = privateCardsHTML;
            document.getElementById('privateFundsSection').style.display = 'block';
        }

        document.getElementById('financeLoading').style.display = 'none';
        document.getElementById('financeContent').style.display = 'block';

    } catch (e) {
        console.error("Finance Calculation Error:", e);
        document.getElementById('financeLoading').innerHTML = `
            <div class="text-center" style="padding: 40px; color: var(--error);">
                <i class="ph ph-warning-circle" style="font-size: 2rem;"></i>
                <p>Failed to calculate financials.</p>
            </div>
        `;
    }
};
