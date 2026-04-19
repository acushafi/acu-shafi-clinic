/**
 * smart_points.js
 * Provides the Smart Point Master data and Autocomplete Component logic.
 */

// Core Data Module
const POINT_CHANNELS = {
    'LU': 11, 'LI': 20, 'ST': 45, 'SP': 21, 'HT': 9, 'SI': 19,
    'UB': 67, 'KI': 27, 'PC': 9, 'SJ': 23, 'GB': 44, 'LR': 14
};

// Flatten to a searchable array
let pointCache = [];
Object.keys(POINT_CHANNELS).forEach(channel => {
    for (let i = 1; i <= POINT_CHANNELS[channel]; i++) {
        pointCache.push(`${channel}${i}`);
    }
});

// Autocomplete Logic
export const initPointAutocomplete = (inputId, containerId, onSelectionChange) => {
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (!input || !container) return;

    let selectedPoints = [];
    let highlightedIndex = -1;
    let currentSuggestions = [];

    // Create dropdown element
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(dropdown);

    const renderChips = () => {
        container.innerHTML = selectedPoints.map(p => `
            <span class="chip">
                ${p}
                <button type="button" class="chip-remove" data-val="${p}"><i class="ph ph-x"></i></button>
            </span>
        `).join('');

        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                selectedPoints = selectedPoints.filter(s => s !== val);
                renderChips();
                // Pass back array or string depending on needs
                onSelectionChange(selectedPoints.join(', '));
            });
        });
    };

    const renderSuggestions = (query) => {
        if (!query) {
            dropdown.style.display = 'none';
            return;
        }

        const q = query.toUpperCase();
        currentSuggestions = pointCache.filter(p => p.startsWith(q) && !selectedPoints.includes(p)).slice(0, 8);

        if (currentSuggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = currentSuggestions.map((s, idx) => `
            <div class="ac-item ${idx === highlightedIndex ? 'highlighted' : ''}" data-val="${s}">
                ${s}
            </div>
        `).join('');
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.ac-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                addPoint(val);
            });
            // Mouse hover tracking for smooth UX
            item.addEventListener('mouseenter', (e) => {
                dropdown.querySelectorAll('.ac-item').forEach(i => i.classList.remove('highlighted'));
                e.currentTarget.classList.add('highlighted');
                highlightedIndex = Array.from(dropdown.children).indexOf(e.currentTarget);
            });
        });
    };

    const addPoint = (val) => {
        if (!selectedPoints.includes(val)) {
            selectedPoints.push(val);
            renderChips();
            onSelectionChange(selectedPoints.join(', '));
        }
        input.value = '';
        renderSuggestions('');
        highlightedIndex = -1;
        input.focus();
    };

    input.addEventListener('input', (e) => {
        highlightedIndex = -1;
        renderSuggestions(e.target.value);
    });

    input.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') {
            // Allow manual entry if they press enter on a non-standard point (e.g., Ahshi)
            if (e.key === 'Enter' && input.value.trim() !== '') {
                e.preventDefault();
                addPoint(input.value.trim().toUpperCase());
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % currentSuggestions.length;
            renderSuggestions(input.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
            renderSuggestions(input.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < currentSuggestions.length) {
                addPoint(currentSuggestions[highlightedIndex]);
            } else if (currentSuggestions.length > 0) {
                // Default to first if none highlighted
                addPoint(currentSuggestions[0]);
            } else if (input.value.trim() !== '') {
                addPoint(input.value.trim().toUpperCase());
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Public method to pre-fill from DB
    return {
        setPoints: (pointsStr) => {
            if (!pointsStr) return;
            selectedPoints = pointsStr.split(',').map(s => s.trim()).filter(s => s !== '');
            renderChips();
            onSelectionChange(selectedPoints.join(', '));
        }
    };
};

// [Phase-8D] Dynamic Point Autocomplete for ASPM Fields
export const initDynamicPointAutocomplete = (inputId, containerId, pointLibrary, onSelectionChange, allowMultiple = false) => {
    const input = document.getElementById(inputId);
    const container = containerId ? document.getElementById(containerId) : null;
    if (!input) return;

    let selectedPoints = [];
    let highlightedIndex = -1;
    let currentSuggestions = [];

    // Create dropdown element
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(dropdown);

    const renderChips = () => {
        if (!container) return;
        container.innerHTML = selectedPoints.map(p => `
            <span class="chip">
                ${p}
                <button type="button" class="chip-remove" data-val="${p}"><i class="ph ph-x"></i></button>
            </span>
        `).join('');

        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                selectedPoints = selectedPoints.filter(s => s !== val);
                renderChips();
                if (allowMultiple) {
                    input.value = selectedPoints.join(', ');
                }
                onSelectionChange(selectedPoints.join(', '));
            });
        });
    };

    const renderSuggestions = (query) => {
        if (!query) {
            dropdown.style.display = 'none';
            return;
        }

        // Handle comma-separated typing
        let qToSearch = query;
        if (allowMultiple) {
            const parts = query.split(',');
            qToSearch = parts[parts.length - 1].trim();
        }

        if (!qToSearch) {
            dropdown.style.display = 'none';
            return;
        }

        const q = qToSearch.toUpperCase();
        currentSuggestions = pointLibrary.filter(p => p.toUpperCase().startsWith(q)).slice(0, 8);

        if (currentSuggestions.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = currentSuggestions.map((s, idx) => `
            <div class="ac-item ${idx === highlightedIndex ? 'highlighted' : ''}" data-val="${s}">
                ${s}
            </div>
        `).join('');
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.ac-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const val = e.currentTarget.dataset.val;
                addPoint(val);
                input.focus();
            });
            item.addEventListener('mouseenter', (e) => {
                dropdown.querySelectorAll('.ac-item').forEach(i => i.classList.remove('highlighted'));
                e.currentTarget.classList.add('highlighted');
                highlightedIndex = Array.from(dropdown.children).indexOf(e.currentTarget);
            });
        });
    };

    const addPoint = (val) => {
        if (allowMultiple) {
            // Keep existing comma separated string, replace the last part being typed
            const parts = input.value.split(',');
            parts.pop(); // remove currently typing part
            parts.push(' ' + val);
            input.value = parts.join(',').trim() + ', ';

            // Also maintain chips if requested
            if (!selectedPoints.includes(val)) {
                selectedPoints.push(val);
                renderChips();
            }
        } else {
            input.value = val;
        }
        onSelectionChange(input.value);
        dropdown.style.display = 'none';
        highlightedIndex = -1;
    };

    input.addEventListener('input', (e) => {
        highlightedIndex = -1;
        renderSuggestions(e.target.value);
        onSelectionChange(e.target.value); // Allow free typing saving
    });

    input.addEventListener('keydown', (e) => {
        if (dropdown.style.display === 'none') {
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % currentSuggestions.length;
            renderSuggestions(input.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
            renderSuggestions(input.value);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (highlightedIndex >= 0 && highlightedIndex < currentSuggestions.length) {
                e.preventDefault();
                addPoint(currentSuggestions[highlightedIndex]);
            } else if (currentSuggestions.length > 0) {
                e.preventDefault();
                addPoint(currentSuggestions[0]);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target !== input && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    return {
        setValue: (val) => {
            if (!val) return;
            input.value = val;
            if (allowMultiple) {
                selectedPoints = val.split(',').map(s => s.trim()).filter(s => s !== '');
                renderChips();
            }
        }
    };
};
