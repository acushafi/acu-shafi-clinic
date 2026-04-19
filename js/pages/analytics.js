import { AnalyticsEngine } from '../treatment_analytics.js';

export const renderAnalyticsView = async (container) => {
    // Basic Layout structure
    container.innerHTML = `
        <div class="header-actions" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
            <div>
                <h2><i class="ph ph-chart-bar" style="color: var(--brand-primary); margin-right: 8px;"></i> Clinical Analytics</h2>
                <p class="text-secondary" style="margin-top:4px;">Analyze treatment success rates across different conditions based on historical records.</p>
            </div>
            <button class="btn-secondary" id="btnRefreshAnalytics"><i class="ph ph-arrows-clockwise"></i> Refresh</button>
        </div>
        
        <div id="analytics_loading_state" class="loading-state">
            <i class="ph ph-spinner-gap spin"></i>
            <p>Compiling Treatment Data...</p>
        </div>
        
        <div id="analytics_content" style="display: none;">
            <!-- Summary stats -->
             <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="dashboard-card" style="padding: 16px;">
                    <h3 style="font-size: 0.9rem; color: var(--text-secondary);"><i class="ph ph-brain"></i> Total Conditions Analyzed</h3>
                    <div id="stat_total_conditions" style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary); margin-top: 8px;">0</div>
                </div>
                <!-- [Phase-17] -->
                <div class="dashboard-card" style="padding: 16px;">
                    <h3 style="font-size: 0.9rem; color: var(--text-secondary);"><i class="ph ph-sparkle"></i> Saved Element Protocols</h3>
                    <div id="stat_total_protocols" style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary); margin-top: 8px;">0</div>
                </div>
            </div>

            <!-- Tabs -->
            <div style="display: flex; gap: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); overflow-x: auto;">
                <button class="tab-btn active" id="tab_general" style="background: none; border: none; padding: 8px 16px; font-weight: 600; color: var(--brand-primary); border-bottom: 2px solid var(--brand-primary); cursor: pointer; white-space: nowrap;">Condition Success</button>
                <button class="tab-btn" id="tab_elements" style="background: none; border: none; padding: 8px 16px; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;">Element Protocols</button>
                <button class="tab-btn" id="tab_pulse" style="background: none; border: none; padding: 8px 16px; font-weight: 600; color: var(--text-secondary); border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;">Pulse Intelligence</button>
            </div>

            <!-- search and filter -->
             <div class="search-sort-bar" style="margin-bottom: 24px;">
                <div class="search-box">
                    <i class="ph ph-magnifying-glass"></i>
                    <input type="text" id="analyticsSearchInput" placeholder="Search conditions or patterns...">
                </div>
            </div>

            <!-- List of analytic cards -->
            <div id="analytics_list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
                 <!-- Populated by JS -->
            </div>
        </div>
    `;

    const loadingState = document.getElementById('analytics_loading_state');
    const contentArea = document.getElementById('analytics_content');
    const analyticsList = document.getElementById('analytics_list');
    const searchInput = document.getElementById('analyticsSearchInput');
    const refreshBtn = document.getElementById('btnRefreshAnalytics');

    // Tabs
    const tabGeneral = document.getElementById('tab_general');
    const tabElements = document.getElementById('tab_elements');
    const tabPulse = document.getElementById('tab_pulse');

    let rawAnalyticsData = [];
    let rawElementProtocols = [];
    let rawPulseAnalytics = [];
    let activeTab = 'general'; // general | elements | pulse

    const loadData = async () => {
        loadingState.style.display = 'flex';
        contentArea.style.display = 'none';

        try {
            rawAnalyticsData = await AnalyticsEngine.getAnalyticsOverview();
            rawElementProtocols = await AnalyticsEngine.getElementProtocolsOverview();

            // [Phase-23] Load Pulse Analytics
            const { getPulseAnalytics } = await import('../pulse_engine.js');
            rawPulseAnalytics = await getPulseAnalytics();

            document.getElementById('stat_total_conditions').textContent = rawAnalyticsData.length;
            document.getElementById('stat_total_protocols').textContent = rawElementProtocols.length;

            refreshView();

            loadingState.style.display = 'none';
            contentArea.style.display = 'block';
        } catch (err) {
            console.error(err);
            loadingState.innerHTML = '<div style="color: var(--error);"><i class="ph ph-warning-circle"></i> Failed to analyze records.</div>';
        }
    };

    const renderElementList = (dataList) => {
        if (dataList.length === 0) {
            analyticsList.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
                <i class="ph ph-sparkle" style="opacity:0.3; font-size: 3rem;"></i>
                <p>No Element Protocols saved yet.</p>
                <span class="text-secondary" style="font-size: 0.85rem;">Perform an "Element Pulse" treatment and save protocol points.</span>
            </div>`;
            return;
        }

        analyticsList.innerHTML = dataList.map(item => {
            let rateColor = 'var(--text-primary)';
            if (item.calcSuccessRate >= 80) rateColor = 'var(--success-color)';
            else if (item.calcSuccessRate >= 50) rateColor = 'var(--warning-color)';
            else if (item.usage_count > 0) rateColor = 'var(--error-color)';

            const pointsArr = item.points.split(',').map(p => p.trim()).filter(Boolean);
            const pointsHtml = pointsArr.length > 0
                ? pointsArr.map(p => `<span class="chip" style="background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); color: var(--brand-primary); padding: 4px 8px; font-size: 0.8rem; font-weight: 600;">${p}</span>`).join('')
                : '<span class="text-secondary" style="font-size:0.8rem;">No points recorded</span>';

            return `
            <div class="dashboard-card" style="padding: 16px; display:flex; flex-direction:column; gap:12px; border-top: 3px solid var(--brand-primary);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">${item.imbalance_pattern}</h3>
                    <div style="text-align:right;">
                        <span style="font-size: 1.2rem; font-weight:bold; color: ${rateColor};">${item.calcSuccessRate}%</span>
                        <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Success Rate</div>
                    </div>
                </div>
                
                <div style="display:flex; gap:16px; background:var(--bg-surface-hover); padding:12px; border-radius:var(--border-radius-sm);">
                    <div style="flex:1;">
                        <div style="font-size:1.1rem; font-weight:600;">${item.usage_count || 0}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">Total Uses</div>
                    </div>
                    <div style="width:1px; background:var(--border-color);"></div>
                    <div style="flex:1;">
                        <div style="font-size:1.1rem; font-weight:600; color:var(--success-color);">${item.success_count || 0}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">Successful</div>
                    </div>
                </div>

                <div>
                    <div style="font-size:0.85rem; font-weight:600; margin-bottom:8px; color:var(--text-secondary);">Saved Protocol Points:</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        ${pointsHtml}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    };

    const renderPulseIntelligenceList = (dataList) => {
        if (dataList.length === 0) {
            analyticsList.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
                <i class="ph ph-activity" style="opacity:0.3; font-size: 3rem;"></i>
                <p>No Pulse Intelligence gathered yet.</p>
                <span class="text-secondary" style="font-size: 0.85rem;">Record Element Pulse combinations during visits and mark outcomes as Resolved to build intelligence.</span>
            </div>`;
            return;
        }

        analyticsList.innerHTML = dataList.map(item => {
            let rateColor = 'var(--text-primary)';
            if (item.successRate >= 80) rateColor = 'var(--success-color)';
            else if (item.successRate >= 50) rateColor = 'var(--warning-color)';
            else if (item.totalCases > 0) rateColor = 'var(--error-color)';

            const pointsHtml = item.bestPoints && item.bestPoints.length > 0
                ? item.bestPoints.map(p => `<span class="chip" style="background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.2); color: var(--brand-primary); padding: 4px 8px; font-size: 0.8rem; font-weight: 600;">${p}</span>`).join('')
                : '<span class="text-secondary" style="font-size:0.8rem;">No points recorded</span>';

            return `
            <div class="dashboard-card" style="padding: 16px; display:flex; flex-direction:column; gap:12px; border-top: 3px solid #8b5cf6;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);"><i class="ph ph-activity"></i> ${item.imbalance_pattern}</h3>
                    <div style="text-align:right;">
                        <span style="font-size: 1.2rem; font-weight:bold; color: ${rateColor};">${item.successRate}%</span>
                        <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px;">Success Rate</div>
                    </div>
                </div>
                
                <div style="display:flex; gap:16px; background:var(--bg-surface-hover); padding:12px; border-radius:var(--border-radius-sm);">
                    <div style="flex:1;">
                        <div style="font-size:1.1rem; font-weight:600;">${item.totalCases}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">Total Cases Identified</div>
                    </div>
                </div>

                <div>
                    <div style="font-size:0.85rem; font-weight:600; margin-bottom:8px; color:var(--text-secondary);">Best Performing Points:</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        ${pointsHtml}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    };

    const refreshView = () => {
        const query = searchInput.value.toLowerCase();

        if (activeTab === 'general') {
            const filtered = rawAnalyticsData.filter(d => d.disease.toLowerCase().includes(query));
            renderGeneralList(filtered);
        } else if (activeTab === 'elements') {
            const filtered = rawElementProtocols.filter(d => d.imbalance_pattern.toLowerCase().includes(query));
            renderElementList(filtered);
        } else {
            const filtered = rawPulseAnalytics.filter(d => d.imbalance_pattern.toLowerCase().includes(query));
            renderPulseIntelligenceList(filtered);
        }
    };

    // Events
    searchInput.addEventListener('input', refreshView);
    refreshBtn.addEventListener('click', loadData);

    const switchTab = (tab) => {
        activeTab = tab;

        tabGeneral.classList.remove('active');
        tabElements.classList.remove('active');
        tabPulse.classList.remove('active');

        tabGeneral.style.color = 'var(--text-secondary)';
        tabGeneral.style.borderBottomColor = 'transparent';
        tabElements.style.color = 'var(--text-secondary)';
        tabElements.style.borderBottomColor = 'transparent';
        tabPulse.style.color = 'var(--text-secondary)';
        tabPulse.style.borderBottomColor = 'transparent';

        if (tab === 'general') {
            tabGeneral.classList.add('active');
            tabGeneral.style.color = 'var(--brand-primary)';
            tabGeneral.style.borderBottomColor = 'var(--brand-primary)';
        } else if (tab === 'elements') {
            tabElements.classList.add('active');
            tabElements.style.color = 'var(--brand-primary)';
            tabElements.style.borderBottomColor = 'var(--brand-primary)';
        } else if (tab === 'pulse') {
            tabPulse.classList.add('active');
            tabPulse.style.color = 'var(--brand-primary)';
            tabPulse.style.borderBottomColor = 'var(--brand-primary)';
        }

        refreshView();
    };

    tabGeneral.addEventListener('click', () => switchTab('general'));
    tabElements.addEventListener('click', () => switchTab('elements'));
    tabPulse.addEventListener('click', () => switchTab('pulse'));

    // Initial load
    await loadData();
};
