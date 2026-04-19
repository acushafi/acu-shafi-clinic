import { initDB, getAllRecords, saveRecord } from './db.js';
import { showToast } from './ui.js';

// Elements
const form = document.getElementById('bookingForm');
const treatmentRadios = document.getElementsByName('treatmentType');
const clinicRadios = document.getElementsByName('clinicLocation');
const clinicSelectionGroup = document.getElementById('clinicSelectionGroup');
const bookingDate = document.getElementById('bookingDate');
const slotsGrid = document.getElementById('slotsGrid');
const slotsLoader = document.getElementById('slotsLoader');
const clinicClosedMsg = document.getElementById('clinicClosedMsg');
const noSlotsMsg = document.getElementById('noSlotsMsg');
const selectedTimeInput = document.getElementById('selectedTime');
const captchaQuestion = document.getElementById('captchaQuestion');
const captchaAnswer = document.getElementById('captchaAnswer');

// State
let currentScheduleConfig = null;
let currentDayBookings = [];
let captchaExpected = 0;

// Setup CAPTCHA
const resetCaptcha = () => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    captchaExpected = num1 + num2;
    captchaQuestion.textContent = `${num1} + ${num2} =`;
    captchaAnswer.value = '';
};

// Initialize Page
const initBookingPage = async () => {
    try {
        await initDB();

        // Set min date to today
        const today = new Date().toISOString().split('T')[0];
        bookingDate.min = today;
        bookingDate.value = today;

        // Fetch schedule configuration
        const schedules = await getAllRecords('clinic_schedule');
        currentScheduleConfig = schedules.find(s => s.id === 'master_schedule') || {
            closed_today: false,
            max_patients: 1,
            parad_morning: { active: true, start: '07:00', end: '09:00' },
            parad_evening: { active: true, start: '15:00', end: '17:00' },
            manantheri: { active: true, start: '11:30', end: '13:30' },
            online: { active: true, slots: ['10:00', '14:00', '20:00'] }
        };

        resetCaptcha();
        bindEvents();

        // Handle URL Parameters (Phase-20)
        handleUrlParams();

        await loadSlots();

    } catch (e) {
        console.error("Booking page init error:", e);
        showToast("Error loading booking system", "error");
    }
};

const bindEvents = () => {
    treatmentRadios.forEach(r => r.addEventListener('change', (e) => {
        if (e.target.value === 'Online Consultation') {
            clinicSelectionGroup.classList.add('hidden');
        } else {
            clinicSelectionGroup.classList.remove('hidden');
        }
        loadSlots();
    }));

    clinicRadios.forEach(r => r.addEventListener('change', loadSlots));
    bookingDate.addEventListener('change', loadSlots);

    form.addEventListener('submit', handleBookingSubmit);
};

// URL Parameter Handling (Phase-20)
const handleUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const typeParam = params.get('type');
    const clinicParam = params.get('clinic');

    if (typeParam === 'online') {
        document.getElementById('typeOnline').checked = true;
        clinicSelectionGroup.classList.add('hidden');
    } else if (typeParam === 'clinic' || clinicParam) {
        document.getElementById('typeClinic').checked = true;
        clinicSelectionGroup.classList.remove('hidden');
    }

    if (clinicParam === 'parad') {
        document.getElementById('clinicParad').checked = true;
    } else if (clinicParam === 'manantheri') {
        document.getElementById('clinicManantheri').checked = true;
    }
};

// Time Helpers
const generateTimeSlots = (startStr, endStr, intervalMinutes = 15) => {
    const slots = [];
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);

    let current = new Date();
    current.setHours(startH, startM, 0, 0);

    const end = new Date();
    end.setHours(endH, endM, 0, 0);

    while (current < end) {
        const hh = current.getHours().toString().padStart(2, '0');
        const mm = current.getMinutes().toString().padStart(2, '0');
        slots.push(`${hh}:${mm}`);
        current.setMinutes(current.getMinutes() + intervalMinutes);
    }
    return slots;
};

const formatTime12h = (time24) => {
    const [h, m] = time24.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12.toString().padStart(2, '0')}:${m} ${ampm}`;
};

// Slot Loading
const loadSlots = async () => {
    slotsLoader.classList.remove('hidden');
    slotsGrid.innerHTML = '';
    slotsGrid.classList.add('hidden');
    clinicClosedMsg.classList.add('hidden');
    noSlotsMsg.classList.add('hidden');
    selectedTimeInput.value = '';

    const dateVal = bookingDate.value;
    if (!dateVal) return;

    // Check if closed
    const dateObj = new Date(dateVal);
    const todayStr = new Date().toISOString().split('T')[0];

    if (currentScheduleConfig.closed_today && dateVal === todayStr) {
        slotsLoader.classList.add('hidden');
        clinicClosedMsg.classList.remove('hidden');
        return;
    }

    try {
        // [Phase-21] Clean up expired pending bookings (older than 10 mins)
        const allBookings = await getAllRecords('booking_requests');
        const nowMs = Date.now();
        const tenMins = 10 * 60 * 1000;

        // Only consider valid and non-expired pending bookings as taking up a slot
        currentDayBookings = allBookings.filter(b => {
            if (b.date !== dateVal || b.status === 'Cancelled') return false;

            if (b.status === 'Pending') {
                const bTimeMs = parseInt(b.id.split('_')[1], 36);
                if (!isNaN(bTimeMs) && (nowMs - bTimeMs > tenMins)) {
                    return false; // Expired, slot is free
                }
            }
            return true;
        });

        const treatmentType = document.querySelector('input[name="treatmentType"]:checked').value;
        const clinic = treatmentType === 'Clinic Visit' ? document.querySelector('input[name="clinicLocation"]:checked').value : 'Online Consultation';
        const maxPerSlot = currentScheduleConfig.max_patients || 1;

        let availableSlots = [];

        if (treatmentType === 'Online Consultation') {
            if (currentScheduleConfig.online.active) {
                availableSlots = currentScheduleConfig.online.slots;
            }
        } else if (clinic === 'Parad Clinic') {
            if (currentScheduleConfig.parad_morning.active) {
                availableSlots.push(...generateTimeSlots(currentScheduleConfig.parad_morning.start, currentScheduleConfig.parad_morning.end));
            }
            if (currentScheduleConfig.parad_evening.active) {
                availableSlots.push(...generateTimeSlots(currentScheduleConfig.parad_evening.start, currentScheduleConfig.parad_evening.end));
            }
        } else if (clinic === 'Manantheri Clinic') {
            if (currentScheduleConfig.manantheri.active) {
                availableSlots.push(...generateTimeSlots(currentScheduleConfig.manantheri.start, currentScheduleConfig.manantheri.end));
            }
        }

        setTimeout(() => {
            slotsLoader.classList.add('hidden');

            if (availableSlots.length === 0) {
                noSlotsMsg.classList.remove('hidden');
                return;
            }

            slotsGrid.classList.remove('hidden');
            availableSlots.forEach(time => {
                const bookedCount = currentDayBookings.filter(b => b.time === time && b.clinic === clinic).length;
                const isFull = bookedCount >= maxPerSlot;

                const btn = document.createElement('div');
                btn.className = `slot-btn ${isFull ? 'full' : ''}`;
                btn.textContent = formatTime12h(time);

                if (isFull) {
                    btn.title = 'Slot Full';
                } else {
                    btn.addEventListener('click', () => {
                        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        selectedTimeInput.value = time;
                    });
                }

                slotsGrid.appendChild(btn);
            });
        }, 300); // Small artificial delay for smooth UI

    } catch (e) {
        console.error("Error loading slots:", e);
        slotsLoader.classList.add('hidden');
        showToast("Error loading slots", "error");
    }
};

const checkRateLimit = () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    let history = JSON.parse(localStorage.getItem('acu_booking_history') || '[]');
    history = history.filter(time => now - time < oneHour); // cleanup old

    if (history.length >= 5) {
        return false;
    }

    history.push(now);
    localStorage.setItem('acu_booking_history', JSON.stringify(history));
    return true;
};

const handleBookingSubmit = async (e) => {
    e.preventDefault();

    // Validations
    if (parseInt(captchaAnswer.value) !== captchaExpected) {
        showToast("Incorrect math answer. Please try again.", "error");
        resetCaptcha();
        return;
    }

    if (!selectedTimeInput.value) {
        showToast("Please select a time slot.", "error");
        return;
    }

    if (!checkRateLimit()) {
        showToast("Too many booking requests. Please try again later.", "error");
        return;
    }

    // [Phase-21] Fake Booking Detection & Block Status Check
    const phone = document.getElementById('patientPhone').value.trim();
    const noShowRecords = await getAllRecords('no_show_records');
    const patientRecord = noShowRecords.find(r => r.phone === phone);

    const warningBox = document.getElementById('protectionWarning');
    const warningTitle = document.getElementById('protectionWarningTitle');
    const warningText = document.getElementById('protectionWarningText');
    warningBox.classList.add('hidden');

    if (patientRecord) {
        if (patientRecord.block_status || patientRecord.no_show_count >= 3) {
            warningTitle.textContent = "Booking Blocked";
            warningText.textContent = "Booking temporarily unavailable due to multiple missed appointments. Please contact Acu Shafi Clinic.";
            warningBox.classList.remove('hidden');
            warningBox.style.background = 'var(--error-light)';
            warningBox.style.color = 'var(--error)';
            warningBox.style.borderColor = 'rgba(220, 38, 38, 0.3)';
            showToast("Booking blocked. Contact clinic.", "error");
            return;
        } else if (patientRecord.no_show_count === 2) {
            warningTitle.textContent = "Warning";
            warningText.textContent = "You have missed previous appointments. Please ensure you attend your booked slot.";
            warningBox.classList.remove('hidden');
            warningBox.style.background = 'var(--warning-light)';
            warningBox.style.color = 'var(--warning)';
            warningBox.style.borderColor = 'rgba(234, 179, 8, 0.3)';
            // Warning allowed to proceed to payment
        }
    }

    const submitBtn = document.getElementById('submitBookingBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ph ph-spinner-gap spin"></i> Verifying...';

    // Proceed to Deposit Flow
    const treatmentType = document.querySelector('input[name="treatmentType"]:checked').value;
    const isClinic = treatmentType === 'Clinic Visit';
    const depositAmt = isClinic ? '₹50' : '₹20';

    document.getElementById('depositType').textContent = treatmentType;
    document.getElementById('depositAmount').textContent = depositAmt;

    // Show modal
    const depositModal = document.getElementById('depositModal');
    depositModal.classList.remove('hidden');

    submitBtn.disabled = false;
    submitBtn.textContent = 'Confirm Booking Request';

    // Bind modal actions (one-time)
    const payBtn = document.getElementById('payDepositBtn');
    const cancelBtn = document.getElementById('cancelDepositBtn');

    const finishBooking = async () => {
        payBtn.disabled = true;
        payBtn.innerHTML = '<i class="ph ph-spinner-gap spin"></i> Processing...';

        try {
            const clinic = isClinic ? document.querySelector('input[name="clinicLocation"]:checked').value : 'Online Consultation';

            const newBooking = {
                id: 'bkg_' + Date.now().toString(36), // ID contains timestamp useful for 10-min expiry
                patient_id: document.getElementById('patientId').value.trim() || null,
                name: document.getElementById('patientName').value.trim(),
                age: parseInt(document.getElementById('patientAge').value),
                gender: document.getElementById('patientGender').value,
                location: document.getElementById('patientLocation').value.trim(),
                phone: phone,
                treatment_type: treatmentType,
                clinic: clinic,
                date: bookingDate.value,
                time: selectedTimeInput.value,
                status: 'Pending' // Requires Doctor Confirmation
            };

            await saveRecord('booking_requests', newBooking);

            depositModal.classList.add('hidden');

            document.getElementById('successName').textContent = newBooking.name;
            document.getElementById('successClinic').textContent = newBooking.clinic;
            document.getElementById('successTime').textContent = `${newBooking.date} at ${formatTime12h(newBooking.time)}`;
            document.getElementById('successModal').classList.remove('hidden');

        } catch (error) {
            console.error("Booking error:", error);
            showToast("Error submitting booking.", "error");
            payBtn.disabled = false;
            payBtn.textContent = 'Pay Deposit Now';
        }
    };

    const cancelDeposit = () => {
        depositModal.classList.add('hidden');
    };

    payBtn.onclick = finishBooking;
    cancelBtn.onclick = cancelDeposit;
};

// Start
document.addEventListener('DOMContentLoaded', initBookingPage);
