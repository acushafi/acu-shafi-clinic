/**
 * ui.js - Global UI Utilities
 * Provides Toast Notifications and Modal Dialogs
 */

// ==========================================
// Toast Notifications
// ==========================================
export const showToast = (message, type = 'info') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon based on type
    let iconClass = 'ph-info';
    if (type === 'success') iconClass = 'ph-check-circle';
    if (type === 'error') iconClass = 'ph-warning-circle';
    if (type === 'warning') iconClass = 'ph-warning';

    toast.innerHTML = `
        <i class="ph ${iconClass} toast-icon"></i>
        <div class="toast-message">${message}</div>
        <button class="toast-close" aria-label="Close"><i class="ph ph-x"></i></button>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Close behavior
    const closeBtn = toast.querySelector('.toast-close');

    let isClosed = false;
    const hideAndRemove = () => {
        if (isClosed) return;
        isClosed = true;
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    };

    closeBtn.addEventListener('click', hideAndRemove);

    // Auto dismiss
    setTimeout(hideAndRemove, 4000);
};

// ==========================================
// Modal Utilities
// ==========================================
export const showModal = (title, contentHtml, onSave = null, saveText = 'Save', modalSize = 'md') => {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');

    if (!overlay || !content) return;

    // Reset classes
    content.className = `modal-content modal-${modalSize}`;

    content.innerHTML = `
        <div class="modal-header">
            <h3>${title}</h3>
            <button class="icon-btn modal-close-btn" id="modalCloseTopBtn"><i class="ph ph-x"></i></button>
        </div>
        <div class="modal-body">
            ${contentHtml}
        </div>
        <div class="modal-footer">
            <button class="btn-secondary" id="modalCancelBtn">Cancel</button>
            ${onSave ? `<button class="primary-btn" id="modalSaveBtn">${saveText}</button>` : ''}
        </div>
    `;

    overlay.classList.remove('hidden');

    const closeModal = () => overlay.classList.add('hidden');

    // Bind Close
    document.getElementById('modalCloseTopBtn').addEventListener('click', closeModal);
    document.getElementById('modalCancelBtn').addEventListener('click', closeModal);

    // Close on click outside
    overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
    };

    // Bind Save
    if (onSave) {
        document.getElementById('modalSaveBtn').addEventListener('click', async (e) => {
            const btn = e.target;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="ph ph-spinner spin"></i> Saving...';
            btn.disabled = true;

            try {
                const success = await onSave();
                if (success !== false) closeModal(); // If onSave returns exactly false, don't close (validation failed)
            } catch (error) {
                showToast(error.message || 'Error saving data', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
};

export const hideModal = () => {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
};
