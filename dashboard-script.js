/**
 * EDUNOVAQ DASHBOARD SCRIPT
 * Combines Data Fetching, Auth, Calendars, Charts, and Glass UI Effects
 */

// ============================================================================
// PART 1: CORE LOGIC & DATA HANDLING
// ============================================================================

// Apply Dark Mode immediately if saved
(function () {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') { document.body.classList.add('light-mode'); }
})();

// Global array to hold the exams
let currentExams = [];

document.addEventListener("DOMContentLoaded", () => {
    checkLoginStatus();
    initStreakAndTimer();
    initDashboardCalendar();
    setupExamModal();

    // Check if we are on the settings page to populate data
    if (window.location.pathname.includes("settings.html")) {
        populateSettingsFields();
    }
});

function checkLoginStatus() {
    const userDataString = localStorage.getItem("user");
    if (userDataString) {
        try {
            const user = JSON.parse(userDataString);
            const profileNameEl = document.getElementById("profile-name-display");
            const profileImgPlaceholder = document.getElementById("profile-img-placeholder");
            const heroGreetingEl = document.getElementById("hero-greeting");

            if (user) {
                const displayName = user.full_name || user.email.split('@')[0];
                const firstName = displayName.split(' ')[0];
                if (profileNameEl) profileNameEl.textContent = displayName;
                if (heroGreetingEl) heroGreetingEl.textContent = `Hello ${firstName}`;
                if (profileImgPlaceholder && displayName) profileImgPlaceholder.textContent = displayName.charAt(0).toUpperCase();

                // REDIRECT LOGIC: Make profile clickable to go to settings
                const profileArea = profileNameEl?.parentElement;
                if (profileArea) {
                    profileArea.style.cursor = "pointer";
                    profileArea.title = "Go to Settings";
                    profileArea.onclick = () => { window.location.href = "settings.html"; };
                }

                const userId = user.id || user.user_id;
                if (userId) {
                    // Only fetch dashboard stats if we are on the dashboard page
                    if (document.getElementById("stat-progress")) {
                        fetchDashboardData(userId);
                    }
                    loadTodayTasks(userId);
                } else {
                    console.warn("No user ID found! Please log out and log back in.");
                }
            }
        } catch (e) { console.error("Error parsing user data:", e); }
    } else { 
        // Redirect to login if no user data found
        if (!window.location.pathname.includes("login.html")) {
            window.location.href = "login.html"; 
        }
    }
}

// --- SETTINGS PAGE LOGIC ---

function populateSettingsFields() {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    // Set Header info
    const nameTitle = document.getElementById('settings-name-title');
    const emailTitle = document.getElementById('settings-email-title');
    const avatar = document.getElementById('settings-avatar');
    
    if (nameTitle) nameTitle.textContent = user.full_name || "User";
    if (emailTitle) emailTitle.textContent = user.email;
    if (avatar) avatar.textContent = (user.full_name || user.email).charAt(0).toUpperCase();

    // Fill Inputs
    const setFullName = document.getElementById('set-fullname');
    if (setFullName) setFullName.value = user.full_name || "";

    // Connect Save Button
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn) {
        saveBtn.onclick = saveSettings;
    }
}

async function saveSettings() {
    const user = JSON.parse(localStorage.getItem("user"));
    const userId = user.id || user.user_id;
    const saveBtn = document.getElementById('save-settings-btn');

    saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    const payload = {
        personal_details: {
            full_name: document.getElementById('set-fullname').value,
            mobile_number: document.getElementById('set-mobile') ? document.getElementById('set-mobile').value : "",
            email: user.email,
            gender: "Not Specified",
            date_of_birth: "2000-01-01",
            city: "Not Specified",
            state: "Not Specified"
        },
        academic_details: {
            class_standard: document.getElementById('set-class') ? document.getElementById('set-class').value : "",
            board: document.getElementById('set-board') ? document.getElementById('set-board').value : "",
            stream: "None",
            subjects: []
        },
        learning_preferences: {
            exam_preparation_for: document.getElementById('set-exams') ? [document.getElementById('set-exams').value] : [],
            preferred_language: "English",
            weak_subjects: [],
            strong_subjects: []
        }
    };

    try {
        const response = await fetch(`/api/update-student-details/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === 'success') {
            user.full_name = payload.personal_details.full_name;
            localStorage.setItem("user", JSON.stringify(user));
            alert("Settings saved successfully!");
            window.location.href = "dashboard.html";
        } else {
            alert("Error: " + (data.detail || "Unknown error"));
        }
    } catch (error) {
        console.error("Save failed:", error);
        alert("Failed to update settings. Check server connection.");
    } finally {
        saveBtn.innerHTML = 'Save Changes';
        saveBtn.disabled = false;
    }
}

// --- STREAK, TIMER, CALENDAR, EXAMS ---

function initStreakAndTimer() {
    const userString = localStorage.getItem("user");
    if (!userString) return;
    try {
        const user = JSON.parse(userString);
        const userId = user.id || user.user_id;
        if (!userId) return;

        const today = new Date().toDateString();
        const lastVisitKey = "lastVisitDate_id" + userId;
        const streakKey = "currentStreak_id" + userId;
        const timeKey = "dailyTimeSeconds_id" + userId;
        const lastTimeDateKey = "lastTimeDate_id" + userId;

        let lastVisit = localStorage.getItem(lastVisitKey);
        let streak = parseInt(localStorage.getItem(streakKey)) || 0;

        if (lastVisit !== today) {
            if (lastVisit) {
                let yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (lastVisit === yesterday.toDateString()) streak++;
                else streak = 1;
            } else { streak = 1; }
            localStorage.setItem(lastVisitKey, today);
            localStorage.setItem(streakKey, streak);
        }

        const streakEl = document.getElementById("stat-streak");
        if (streakEl) streakEl.textContent = streak;

        let dailyTimeSeconds = parseInt(localStorage.getItem(timeKey)) || 0;
        let lastTimeDate = localStorage.getItem(lastTimeDateKey);

        if (lastTimeDate !== today) {
            dailyTimeSeconds = 0;
            localStorage.setItem(lastTimeDateKey, today);
        }

        const timeEl = document.getElementById("stat-time");
        function formatTime(totalSeconds) {
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            if (h > 0) return `${h}h ${m}m`;
            else if (m > 0) return `${m}m`;
            else return `${s}s`;
        }

        setInterval(() => {
            dailyTimeSeconds++;
            localStorage.setItem(timeKey, dailyTimeSeconds);
            if (timeEl) timeEl.textContent = formatTime(dailyTimeSeconds);
        }, 1000);

        if (timeEl) timeEl.textContent = formatTime(dailyTimeSeconds);
    } catch (e) { console.error("Error setting up streak and timer:", e); }
}

function fetchDashboardData(userId) {
    fetch(`/api/dashboard-stats/${userId}`)
        .then(response => {
            if (!response.ok) throw new Error("Could not fetch stats");
            return response.json();
        })
        .then(data => {
            const heroSubtitle = document.getElementById("hero-subtitle");
            if (heroSubtitle) heroSubtitle.textContent = data.hero_subtitle;

            const progressEl = document.getElementById("stat-progress");
            const pendingEl = document.getElementById("stat-pending");
            if (progressEl && data.stats) progressEl.textContent = data.stats.progress + "%";
            if (pendingEl && data.stats) pendingEl.textContent = data.stats.pending;

            currentExams = data.upcoming_exams || [];
            renderExams(currentExams);
            
            // Only render charts if data exists to prevent errors
            if (data.charts && data.charts.performance && data.charts.attendance) {
                renderCharts(data.charts.performance, data.charts.attendance);
            }
        })
        .catch(error => console.error("Error fetching dashboard data (Is your server running?):", error));
}

function renderExams(exams) {
    const examsContainer = document.getElementById("exams-container");
    if (!examsContainer) return;
    examsContainer.innerHTML = "";
    if (exams.length === 0) {
        examsContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; margin-top: 10px;">No exams added.</p>';
        return;
    }
    exams.forEach((exam, index) => {
        examsContainer.innerHTML += `
            <div class="list-row" style="position: relative; margin-top: 15px;">
                <i class="fa-solid fa-book list-icon"></i>
                <div>
                    <h4 style="margin: 0; font-size: 15px; font-weight: 700;">${exam.subject}</h4>
                    <p style="margin: 4px 0 0 0; font-size:11px; opacity:0.7;">${exam.date} • ${exam.time}</p>
                </div>
                <i class="fa-solid fa-trash" title="Remove Exam" style="position: absolute; right: 10px; top: 10px; cursor: pointer; opacity: 0.4; font-size: 14px; transition: 0.3s;" onclick="deleteExam(${index})" onmouseover="this.style.opacity='1'; this.style.color='#ff4757';" onmouseout="this.style.opacity='0.4'; this.style.color='white';"></i>
            </div>
            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 15px 0 0 0;">
        `;
    });
}

function formatExamDate(dateStr) {
    const date = new Date(dateStr);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let d = date.getDate();
    return `${months[date.getMonth()]} ${d < 10 ? '0' + d : d}`;
}

function formatExamTime(time24) {
    if (!time24) return '';
    let [hours, minutes] = time24.split(':');
    hours = parseInt(hours);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours < 10 ? '0' + hours : hours}:${minutes} ${ampm}`;
}

function setupExamModal() {
    const addBtn = document.getElementById('open-exam-modal-btn');
    const modal = document.getElementById('add-exam-modal');
    const overlay = document.getElementById('modal-overlay');
    const cancelBtn = document.getElementById('cancel-exam-btn');
    const saveBtn = document.getElementById('save-exam-btn');
    if (!addBtn || !modal) return;
    addBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        if(overlay) overlay.style.display = 'block';
    });
    const close = () => {
        modal.style.display = 'none';
        if(overlay) overlay.style.display = 'none';
        document.getElementById('exam-subject-input').value = '';
        document.getElementById('exam-date-input').value = '';
        document.getElementById('exam-time-input').value = '';
    };
    if(cancelBtn) cancelBtn.addEventListener('click', close);
    if(overlay) overlay.addEventListener('click', close);
    if(saveBtn) {
        saveBtn.addEventListener('click', () => {
            const subject = document.getElementById('exam-subject-input').value.trim();
            const rawDate = document.getElementById('exam-date-input').value;
            const rawTime = document.getElementById('exam-time-input').value;
            if (!subject || !rawDate || !rawTime) { alert("Please fill in all fields."); return; }
            const formattedDate = formatExamDate(rawDate);
            const formattedTime = formatExamTime(rawTime);
            currentExams.push({ subject: subject, date: formattedDate, time: formattedTime });
            const user = JSON.parse(localStorage.getItem("user"));
            const userId = user.id || user.user_id;
            syncExamsToBackend(userId, currentExams);
            renderExams(currentExams);
            close();
        });
    }
}

window.deleteExam = function (index) {
    currentExams.splice(index, 1);
    const user = JSON.parse(localStorage.getItem("user"));
    const userId = user.id || user.user_id;
    syncExamsToBackend(userId, currentExams);
    renderExams(currentExams);
};

function syncExamsToBackend(userId, exams) {
    fetch('/api/update-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, exams: exams })
    }).catch(error => console.error("Error saving exams:", error));
}

function renderCharts(perfData, attData) {
    // Requires Chart.js to be loaded in the HTML
    if (typeof Chart === 'undefined') {
        console.error("Chart.js is not loaded. Please include the Chart.js script tag in your HTML.");
        return;
    }

    Chart.defaults.color = '#fff';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    const ctxPEl = document.getElementById('perfChart');
    
    if (ctxPEl) {
        const ctxP = ctxPEl.getContext('2d');
        if (window.perfChartInstance) window.perfChartInstance.destroy();
        const centerText = {
            id: 'centerText', beforeDraw: function (chart) {
                var width = chart.width, height = chart.height, ctx = chart.ctx;
                ctx.restore(); ctx.font = "800 24px Nunito"; ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
                var text = perfData[0] + "%", textX = Math.round((width - ctx.measureText(text).width) / 2), textY = height / 2;
                ctx.fillText(text, textX, textY); ctx.save();
            }
        };
        window.perfChartInstance = new Chart(ctxP, {
            type: 'doughnut',
            data: { datasets: [{ data: perfData, backgroundColor: ['#ffffff', 'rgba(255,255,255,0.1)'], borderWidth: 0, cutout: '80%', borderRadius: 20 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
            plugins: [centerText]
        });
    }
    
    const ctxAEl = document.getElementById('attChart');
    if (ctxAEl) {
        const ctxA = ctxAEl.getContext('2d');
        if (window.attChartInstance) window.attChartInstance.destroy();
        let gradient = ctxA.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        window.attChartInstance = new Chart(ctxA, {
            type: 'line',
            data: {
                labels: ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'],
                datasets: [{
                    label: 'Activity', data: attData, borderColor: '#ffffff', backgroundColor: gradient,
                    borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#ffffff', pointBorderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 12 } } }, y: { display: false } },
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
    }
}

async function loadTodayTasks(userId) {
    const today = new Date();
    let m = today.getMonth() + 1;
    let d = today.getDate();
    const todayStr = `${today.getFullYear()}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`;
    try {
        const response = await fetch(`/api/get-schedule/${userId}`);
        const data = await response.json();
        const taskContainer = document.getElementById('dashboard-tasks-container');
        if (!taskContainer) return;
        if (data.status === "success" && data.schedule && data.schedule[todayStr]) {
            const tasks = data.schedule[todayStr];
            taskContainer.innerHTML = '';
            if (tasks.length === 0) {
                taskContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; padding: 10px 0;">No tasks scheduled for today.</p>';
                return;
            }
            tasks.forEach(task => {
                taskContainer.innerHTML += `
                    <div class="dash-task-item">
                        <div class="dash-task-dot"></div>
                        <div class="dash-task-info">
                            <h4 style="font-size: 15px;">${task.name}</h4>
                            <p style="font-size: 11px;">${task.timeString}</p>
                        </div>
                    </div>
                `;
            });
        } else {
            taskContainer.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; padding: 10px 0;">No tasks scheduled for today.</p>';
        }
    } catch (error) { console.error("Error loading today's tasks:", error); }
}

function initDashboardCalendar() {
    const currentDate = document.querySelector(".current-date");
    const daysTag = document.querySelector(".days");
    const prevNextIcon = document.querySelectorAll(".calendar-icons span");
    if (!daysTag) return;
    let date = new Date(), currYear = date.getFullYear(), currMonth = date.getMonth();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const renderCalendar = () => {
        let firstDayofMonth = new Date(currYear, currMonth, 1).getDay(),
            lastDateofMonth = new Date(currYear, currMonth + 1, 0).getDate(),
            lastDayofMonth = new Date(currYear, currMonth, lastDateofMonth).getDay(),
            lastDateofLastMonth = new Date(currYear, currMonth, 0).getDate();
        let liTag = "";
        for (let i = firstDayofMonth; i > 0; i--) { liTag += `<li class="inactive">${lastDateofLastMonth - i + 1}</li>`; }
        for (let i = 1; i <= lastDateofMonth; i++) {
            let isToday = i === new Date().getDate() && currMonth === new Date().getMonth() && currYear === new Date().getFullYear() ? "active" : "";
            let m = currMonth + 1; let d = i;
            let dateStr = `${currYear}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`;
            liTag += `<li class="${isToday} clickable-day" data-date="${dateStr}" style="cursor: pointer; position: relative; z-index: 10;" title="Add tasks for ${dateStr}">${i}</li>`;
        }
        for (let i = lastDayofMonth; i < 6; i++) { liTag += `<li class="inactive">${i - lastDayofMonth + 1}</li>` }
        if (currentDate) { currentDate.innerText = `${months[currMonth]} ${currYear}`; }
        daysTag.innerHTML = liTag;
        const clickableDays = daysTag.querySelectorAll('.clickable-day');
        clickableDays.forEach(day => {
            day.addEventListener('click', function () {
                const selectedDate = this.getAttribute('data-date');
                window.location.href = `calendar.html?date=${selectedDate}`;
            });
        });
    }
    renderCalendar();
    if (prevNextIcon) {
        prevNextIcon.forEach(icon => {
            icon.addEventListener("click", () => {
                currMonth = icon.id === "prev" ? currMonth - 1 : currMonth + 1;
                if (currMonth < 0 || currMonth > 11) {
                    date = new Date(currYear, currMonth, new Date().getDate());
                    currYear = date.getFullYear(); currMonth = date.getMonth();
                } else { date = new Date(); }
                renderCalendar();
            });
        });
    }
}

function logout() {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Global click listener for logout
document.addEventListener('click', (e) => {
    if (e.target.id === 'logout-link' || e.target.id === 'logout-icon' || e.target.closest('#logout-link')) { logout(); }
});


// ============================================================================
// PART 2: UI EFFECTS & ANIMATIONS (Glass Card Effects)
// ============================================================================

(function () {
    'use strict';

    const CFG = {
        cardSelectors: [
            '.card', '.widget', '.tool-card', '.focus-card',
            '.study-card', '.tool-option-card', '.auth-card',
            '.calendar-wrapper', '.timeline-item', '.dash-task-item'
        ],
        tiltMax:          7,
        spotlightSize:    550,
        spotlightColor:   'rgba(70, 130, 255, 0.10)',
        spotlightEdge:    'rgba(40, 90, 220, 0.04)',
        pageGlowSize:     350,
        pageGlowColor:    'rgba(55, 110, 255, 0.055)',
        staggerDelay:     60,
        revealThreshold:  0.12,
    };

    const CARD_SEL = CFG.cardSelectors.join(', ');

    function injectSpotlights() {
        document.querySelectorAll(CARD_SEL).forEach(card => {
            if (card.querySelector('.card-spotlight')) return;

            const pos = getComputedStyle(card).position;
            if (pos === 'static') card.style.position = 'relative';
            card.style.overflow = 'hidden';

            const spot = document.createElement('div');
            spot.className = 'card-spotlight';
            spot.style.cssText = `
                position: absolute;
                inset: 0;
                border-radius: inherit;
                opacity: 0;
                pointer-events: none;
                z-index: 0;
                transition: opacity 0.45s ease;
                background: radial-gradient(
                    ${CFG.spotlightSize}px circle at 50% 50%,
                    ${CFG.spotlightColor} 0%,
                    ${CFG.spotlightEdge} 45%,
                    transparent 70%
                );
            `;
            card.insertBefore(spot, card.firstChild);
        });
    }

    function onCardMouseMove(e) {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();

        const xPct = (e.clientX - rect.left) / rect.width;
        const yPct = (e.clientY - rect.top)  / rect.height;

        const spot = card.querySelector('.card-spotlight');
        if (spot) {
            spot.style.background = `radial-gradient(
                ${CFG.spotlightSize}px circle at ${xPct * 100}% ${yPct * 100}%,
                ${CFG.spotlightColor} 0%,
                ${CFG.spotlightEdge} 45%,
                transparent 70%
            )`;
            spot.style.opacity = '1';
        }

        const rotX = (yPct - 0.5) * -CFG.tiltMax * 2;
        const rotY = (xPct - 0.5) * CFG.tiltMax * 2;
        card.style.transform = [
            'translateY(-6px)',
            'scale(1.008)',
            'perspective(900px)',
            `rotateX(${rotX}deg)`,
            `rotateY(${rotY}deg)`
        ].join(' ');
    }

    function onCardMouseEnter(e) {
        const spot = e.currentTarget.querySelector('.card-spotlight');
        if (spot) spot.style.opacity = '1';
    }

    function onCardMouseLeave(e) {
        const card = e.currentTarget;
        card.style.transform = '';
        const spot = card.querySelector('.card-spotlight');
        if (spot) spot.style.opacity = '0';
    }

    const attached = new WeakSet();

    function attachListeners() {
        document.querySelectorAll(CARD_SEL).forEach(card => {
            if (attached.has(card)) return;
            attached.add(card);
            card.addEventListener('mouseenter', onCardMouseEnter, { passive: true });
            card.addEventListener('mousemove',  onCardMouseMove,  { passive: true });
            card.addEventListener('mouseleave', onCardMouseLeave, { passive: true });
        });
    }

    function initPageGlow() {
        if (document.getElementById('__edu-cursor-glow')) return;

        const glow = document.createElement('div');
        glow.id = '__edu-cursor-glow';
        glow.style.cssText = `
            position: fixed;
            width: ${CFG.pageGlowSize}px;
            height: ${CFG.pageGlowSize}px;
            border-radius: 50%;
            background: radial-gradient(circle, ${CFG.pageGlowColor} 0%, transparent 70%);
            pointer-events: none;
            z-index: 9998;
            transform: translate(-50%, -50%);
            will-change: left, top;
            transition: left 0.08s linear, top 0.08s linear;
        `;
        document.body.appendChild(glow);

        document.addEventListener('mousemove', e => {
            glow.style.left = e.clientX + 'px';
            glow.style.top  = e.clientY + 'px';
        }, { passive: true });
    }

    function runEntranceAnimations() {
        const cards = Array.from(document.querySelectorAll(CARD_SEL));
        cards.forEach((card, i) => {
            if (card.dataset.eduEntered) return;
            card.dataset.eduEntered = '1';

            card.style.opacity    = '0';
            card.style.transform  = 'translateY(24px)';
            card.style.transition = 'opacity 0.55s ease, transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)';

            setTimeout(() => {
                card.style.opacity   = '1';
                card.style.transform = 'translateY(0)';
            }, i * CFG.staggerDelay + 80);
        });
    }

    function initScrollReveal() {
        if (!('IntersectionObserver' in window)) return;

        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const el = entry.target;
                el.style.opacity   = '1';
                el.style.transform = 'translateY(0)';
                io.unobserve(el);
            });
        }, { threshold: CFG.revealThreshold });

        document.querySelectorAll('.list-row, .widgets-row .widget').forEach(el => {
            if (el.dataset.eduEntered) return;
            el.dataset.eduEntered = '1';
            el.style.opacity    = '0';
            el.style.transform  = 'translateY(18px)';
            el.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
            io.observe(el);
        });
    }

    function initBellPulse() {
        const bell = document.querySelector('.fa-bell, [data-bell], #notification-bell');
        if (!bell || bell.dataset.eduBell) return;
        bell.dataset.eduBell = '1';

        if (!document.getElementById('__edu-bell-kf')) {
            const s = document.createElement('style');
            s.id = '__edu-bell-kf';
            s.textContent = `
                @keyframes __eduBellShake {
                    0%,100% { transform: rotate(0); }
                    15%     { transform: rotate(14deg); }
                    30%     { transform: rotate(-10deg); }
                    45%     { transform: rotate(8deg); }
                    60%     { transform: rotate(-6deg); }
                    75%     { transform: rotate(3deg); }
                }
                @keyframes __eduPingRing {
                    0%   { transform: scale(1);   opacity: 0.7; }
                    100% { transform: scale(2.4); opacity: 0; }
                }
                .__edu-ping {
                    position: absolute;
                    top: -4px; right: -4px;
                    width: 10px; height: 10px;
                    border-radius: 50%;
                    background: #4a90ff;
                    animation: __eduPingRing 1.7s ease-out infinite;
                    pointer-events: none;
                }
            `;
            document.head.appendChild(s);
        }

        const wrapper = document.createElement('span');
        wrapper.style.cssText = 'position:relative; display:inline-flex; align-items:center; justify-content:center;';
        bell.parentNode.insertBefore(wrapper, bell);
        wrapper.appendChild(bell);

        const ping = document.createElement('span');
        ping.className = '__edu-ping';
        wrapper.appendChild(ping);

        bell.style.cursor = 'pointer';
        bell.addEventListener('click', () => {
            bell.style.animation = 'none';
            requestAnimationFrame(() => {
                bell.style.animation = '__eduBellShake 0.5s ease';
            });
            bell.addEventListener('animationend', () => {
                bell.style.animation = '';
            }, { once: true });
        });
    }

    function highlightActiveNav() {
        const current = window.location.pathname.split('/').pop() || 'dashboard.html';
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = (link.getAttribute('href') || '').split('/').pop();
            if (href && current.startsWith(href.replace('.html', ''))) {
                link.classList.add('active');
            }
        });
    }

    function initRipple() {
        if (!document.getElementById('__edu-ripple-style')) {
            const s = document.createElement('style');
            s.id = '__edu-ripple-style';
            s.textContent = `
                .hero-btn, .card-btn, .action-btn,
                .auth-button, .play-btn, #add-task-btn,
                #open-exam-modal-btn, #save-exam-btn,
                #save-settings-btn, #add-task-btn {
                    position: relative;
                    overflow: hidden;
                }
                .__edu-ripple {
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.26);
                    transform: scale(0);
                    animation: __eduRippleAnim 0.58s linear;
                    pointer-events: none;
                }
                @keyframes __eduRippleAnim {
                    to { transform: scale(4); opacity: 0; }
                }
            `;
            document.head.appendChild(s);
        }

        const BTN_SEL = [
            '.hero-btn', '.card-btn', '.action-btn', '.auth-button',
            '.play-btn', '#add-task-btn', '#open-exam-modal-btn',
            '#save-exam-btn', '#save-settings-btn'
        ].join(', ');

        document.querySelectorAll(BTN_SEL).forEach(btn => {
            if (btn.dataset.eduRipple) return;
            btn.dataset.eduRipple = '1';
            btn.addEventListener('click', function (e) {
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const ripple = document.createElement('span');
                ripple.className = '__edu-ripple';
                ripple.style.cssText = `
                    width: ${size}px; height: ${size}px;
                    left: ${e.clientX - rect.left - size / 2}px;
                    top:  ${e.clientY - rect.top  - size / 2}px;
                `;
                this.appendChild(ripple);
                ripple.addEventListener('animationend', () => ripple.remove());
            });
        });
    }

    function injectGlassShimmerStyle() {
        if (document.getElementById('__edu-glass-style')) return;

        const s = document.createElement('style');
        s.id = '__edu-glass-style';
        s.textContent = `
            .card::after, .widget::after, .tool-card::after, .focus-card::after,
            .study-card::after, .auth-card::after, .calendar-wrapper::after {
                content: ''; position: absolute; top: 0; left: 8%; right: 8%; height: 1px;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.20) 25%, rgba(255,255,255,0.36) 50%, rgba(255,255,255,0.20) 75%, transparent 100%);
                border-radius: 24px 24px 0 0; pointer-events: none; z-index: 1;
            }
            .card, .widget, .tool-card, .focus-card, .study-card, .tool-option-card, .auth-card,
            .calendar-wrapper, .dash-task-item, .timeline-item {
                transition: transform 0.38s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.38s cubic-bezier(0.23, 1, 0.32, 1), border-color 0.38s ease, background 0.38s ease !important;
                will-change: transform;
            }
            .card:hover, .widget:hover {
                box-shadow: 0 22px 55px rgba(0,0,0,0.65), 0 8px 20px rgba(20,60,200,0.22), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(0,0,0,0.22) !important;
            }
            .tool-card:hover, .focus-card:hover, .study-card:hover {
                box-shadow: 0 28px 65px rgba(0,0,0,0.70), 0 12px 26px rgba(20,60,200,0.28), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.25) !important;
            }
            .dash-task-item { transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1), border-color 0.3s ease, box-shadow 0.3s ease !important; }
            .dash-task-item:hover { transform: translateX(5px) !important; border-color: rgba(80,140,255,0.40) !important; box-shadow: 0 6px 24px rgba(20,60,200,0.25) !important; }
            .timeline-item:hover .time-dot { box-shadow: 0 0 12px rgba(80,160,255,0.80); background: #4fc8ff; transition: box-shadow 0.3s ease, background 0.3s ease; }
            .widget-icon { filter: drop-shadow(0 0 9px rgba(80,160,255,0.48)); transition: filter 0.3s ease; }
            .widget:hover .widget-icon { filter: drop-shadow(0 0 18px rgba(80,160,255,0.80)); }
            .hero-btn { position: relative; overflow: hidden; }
            .hero-btn::before { content: ''; position: absolute; top: 0; left: -80%; width: 55%; height: 100%; background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.24) 50%, transparent 100%); transform: skewX(-20deg); transition: left 0.60s ease; pointer-events: none; }
            .hero-btn:hover::before { left: 135%; }
            .search-bar:focus-within { border-color: rgba(80,140,255,0.55) !important; box-shadow: 0 0 0 3px rgba(60,110,255,0.14), 0 4px 20px rgba(0,0,0,0.4) !important; }
            .auth-card input:focus, .schedule-inputs input:focus, .details-card input:focus, .details-card select:focus { outline: none; border-color: #4fc8ff !important; box-shadow: 0 0 0 3px rgba(40,120,255,0.18) !important; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .calendar .days li { transition: background 0.2s ease, transform 0.2s ease; }
            .calendar .days li:hover:not(.active) { transform: scale(1.12); }
            .calendar .days li.active { box-shadow: 0 0 18px rgba(30,120,255,0.72) !important; }
            .nav-link .icon-container { transition: background 0.3s ease, box-shadow 0.3s ease, transform 0.3s cubic-bezier(0.23, 1, 0.32, 1) !important; }
            .nav-link:hover .icon-container, .nav-link.active .icon-container { transform: scale(1.12) !important; }
        `;
        document.head.appendChild(s);
    }

    function init() {
        injectGlassShimmerStyle();
        injectSpotlights();
        attachListeners();
        initRipple();
        highlightActiveNav();
    }

    function onReady() {
        init();
        initPageGlow();
        runEntranceAnimations();
        setTimeout(() => {
            initBellPulse();
            initScrollReveal();
        }, 200);
        setTimeout(init, 900);
        setTimeout(init, 2400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }

    const mo = new MutationObserver((mutations) => {
        let hasNew = false;
        for (const m of mutations) {
            if (m.addedNodes.length) { hasNew = true; break; }
        }
        if (!hasNew) return;
        injectSpotlights();
        attachListeners();
        initRipple();
    });

    const startObserving = () => mo.observe(document.body, { childList: true, subtree: true });
    if (document.body) startObserving();
    else document.addEventListener('DOMContentLoaded', startObserving);

})();