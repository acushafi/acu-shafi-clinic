import { getRecord, saveRecord, getAllRecords } from '../db.js';
import { showToast } from '../ui.js';

export const renderAvailabilityView = async (container) => {
    container.innerHTML = `
        <div class="header-actions">
            <div>
                <h2 id="pageTitle">Clinic Availability</h2>
                <p class="text-muted">Control your clinic timings and online slots</p>
            </div>
            <button class="primary-btn" id="saveAvailabilityBtn">
                <i class="ph ph-floppy-disk"></i> Save Settings
            </button>
        </div>

        <div class="settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top:20px;">
            
            <!-- Global Controls -->
            <div class="card p-4">
                <h3 class="mb-3 border-bottom pb-2"><i class="ph ph-sliders"></i> Global Settings</h3>
                
                <div class="form-group mb-3 d-flex justify-content-between align-items-center">
                    <div>
                        <strong>Full Day Closure</strong>
                        <p class="text-muted small mb-0">Suspend all bookings for today</p>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="av_closed_today">
                        <span class="slider round"></span>
                    </label>
                </div>

                <div class="form-group mb-3">
                    <label>Max Patients Per Slot</label>
                    <input type="number" id="av_max_patients" class="form-control mt-1" min="1" max="10" placeholder="Default: 1">
                    <small class="text-muted">Maximum parallel bookings allowed for a single 15-minute window.</small>
                </div>
            </div>

            <!-- Parad Clinic -->
            <div class="card p-4">
                <h3 class="mb-3 border-bottom pb-2"><i class="ph ph-map-pin"></i> Parad Clinic</h3>
                
                <div class="form-group mb-3 pb-2 border-bottom">
                    <div class="d-flex justify-content-between mb-2">
                        <strong>Morning Shift</strong>
                        <label class="toggle-switch">
                            <input type="checkbox" id="av_parad_morning_active">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <input type="time" id="av_parad_morning_start" class="form-control form-control-sm">
                        <span>to</span>
                        <input type="time" id="av_parad_morning_end" class="form-control form-control-sm">
                    </div>
                </div>

                <div class="form-group mb-0">
                    <div class="d-flex justify-content-between mb-2">
                        <strong>Evening Shift</strong>
                        <label class="toggle-switch">
                            <input type="checkbox" id="av_parad_evening_active">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <input type="time" id="av_parad_evening_start" class="form-control form-control-sm">
                        <span>to</span>
                        <input type="time" id="av_parad_evening_end" class="form-control form-control-sm">
                    </div>
                </div>
            </div>

            <!-- Manantheri Clinic -->
            <div class="card p-4">
                <h3 class="mb-3 border-bottom pb-2"><i class="ph ph-map-pin"></i> Manantheri Clinic</h3>
                
                <div class="form-group mb-3">
                    <div class="d-flex justify-content-between mb-2">
                        <strong>Working Hours</strong>
                        <label class="toggle-switch">
                            <input type="checkbox" id="av_manantheri_active">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <input type="time" id="av_manantheri_start" class="form-control form-control-sm">
                        <span>to</span>
                        <input type="time" id="av_manantheri_end" class="form-control form-control-sm">
                    </div>
                </div>
            </div>

            <!-- Online Consultation -->
            <div class="card p-4">
                <h3 class="mb-3 border-bottom pb-2"><i class="ph ph-video-camera"></i> Online Consultation</h3>
                
                <div class="form-group mb-3">
                    <div class="d-flex justify-content-between mb-2">
                        <strong>Accept Online Bookings</strong>
                        <label class="toggle-switch">
                            <input type="checkbox" id="av_online_active">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <label class="mt-2">Available Slots (Comma separated)</label>
                    <input type="text" id="av_online_slots" class="form-control mt-1" placeholder="10:00, 14:00, 20:00">
                    <small class="text-muted">Use 24-Hour formats (HH:MM)</small>
                </div>
            </div>

        </div>
    `;

    // Load Data
    let schedule = null;
    try {
        const schedules = await getAllRecords('clinic_schedule');
        schedule = schedules.find(s => s.id === 'master_schedule');
    } catch (e) {
        console.error(e);
    }

    if (!schedule) {
        // Default Settings
        schedule = {
            id: 'master_schedule',
            closed_today: false,
            max_patients: 1,
            parad_morning: { active: true, start: '07:00', end: '09:00' },
            parad_evening: { active: true, start: '15:00', end: '17:00' },
            manantheri: { active: true, start: '11:30', end: '13:30' },
            online: { active: true, slots: ['10:00', '14:00', '20:00'] }
        };
    }

    // Populate Fields
    document.getElementById('av_closed_today').checked = schedule.closed_today;
    document.getElementById('av_max_patients').value = schedule.max_patients || 1;

    document.getElementById('av_parad_morning_active').checked = schedule.parad_morning.active;
    document.getElementById('av_parad_morning_start').value = schedule.parad_morning.start;
    document.getElementById('av_parad_morning_end').value = schedule.parad_morning.end;

    document.getElementById('av_parad_evening_active').checked = schedule.parad_evening.active;
    document.getElementById('av_parad_evening_start').value = schedule.parad_evening.start;
    document.getElementById('av_parad_evening_end').value = schedule.parad_evening.end;

    document.getElementById('av_manantheri_active').checked = schedule.manantheri.active;
    document.getElementById('av_manantheri_start').value = schedule.manantheri.start;
    document.getElementById('av_manantheri_end').value = schedule.manantheri.end;

    document.getElementById('av_online_active').checked = schedule.online.active;
    document.getElementById('av_online_slots').value = schedule.online.slots.join(', ');

    // Bind Save Action
    document.getElementById('saveAvailabilityBtn').addEventListener('click', async () => {
        try {
            const btn = document.getElementById('saveAvailabilityBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner-gap spin"></i> Saving...';

            const updatedSchedule = {
                id: 'master_schedule',
                closed_today: document.getElementById('av_closed_today').checked,
                max_patients: parseInt(document.getElementById('av_max_patients').value) || 1,
                parad_morning: {
                    active: document.getElementById('av_parad_morning_active').checked,
                    start: document.getElementById('av_parad_morning_start').value,
                    end: document.getElementById('av_parad_morning_end').value
                },
                parad_evening: {
                    active: document.getElementById('av_parad_evening_active').checked,
                    start: document.getElementById('av_parad_evening_start').value,
                    end: document.getElementById('av_parad_evening_end').value
                },
                manantheri: {
                    active: document.getElementById('av_manantheri_active').checked,
                    start: document.getElementById('av_manantheri_start').value,
                    end: document.getElementById('av_manantheri_end').value
                },
                online: {
                    active: document.getElementById('av_online_active').checked,
                    slots: document.getElementById('av_online_slots').value.split(',').map(s => s.trim()).filter(s => s)
                }
            };

            await saveRecord('clinic_schedule', updatedSchedule);
            showToast("Availability settings saved", "success");

            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Save Settings';
        } catch (e) {
            console.error("Save availability error:", e);
            showToast("Error saving availability", "error");
        }
    });

    document.getElementById('pageTitle').textContent = "Clinic Availability";
};
