// script.js (파이어베이스 실시간 연동 완성본)

// =========================================================
// 🚨 [중요] 1단계에서 복사한 본인의 키값으로 아래 내용을 바꿔주세요!
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyD4m17c3vdKM4p1c0sp0CJ6fetUwf5A0xA",
  authDomain: "pharmacy-sch-251127.firebaseapp.com",
  projectId: "pharmacy-sch-251127",
  storageBucket: "pharmacy-sch-251127.firebasestorage.app",
  messagingSenderId: "1028219799154",
  appId: "1:1028219799154:web:669dc1a10e7a1f5f8f64eb"
};

// --- 파이어베이스 초기화 (건드리지 마세요) ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 전역 변수 ---
const SUPER_PW = "dpdlxmqbxl1*";
let config = { pharmacyName: "로딩중...", password: "0000" };
let employees = [];
let schedules = [];

let currentDate = new Date();
let activeEmployeeId = null;
let selectedDate = null;
let editingScheduleId = null;

// DOM 요소
const calendarGrid = document.getElementById('calendar');
const currentMonthDisplay = document.getElementById('current-month');
const employeeListEl = document.getElementById('employee-list');
const mainTitle = document.getElementById('main-title');

// 모달
const shiftModal = document.getElementById('shift-modal');
const statsModal = document.getElementById('stats-modal');
const pwModal = document.getElementById('password-modal');
const settingsModal = document.getElementById('settings-modal');

// --- 초기 실행 ---
initTimeOptions();
listenToData(); // ★ 실시간 데이터 수신 시작!

// ==========================================
// ★ 파이어베이스 실시간 리스너 (자동 업데이트)
// ==========================================
function listenToData() {
    // 1. 환경설정 감시
    db.collection('settings').doc('config').onSnapshot((doc) => {
        if (doc.exists) {
            config = doc.data();
        } else {
            // 데이터 없으면 초기값 생성
            config = { pharmacyName: "에이트약국", password: "0000" };
            db.collection('settings').doc('config').set(config);
        }
        updateTitle();
    });

    // 2. 직원 목록 감시
    db.collection('employees').onSnapshot((snapshot) => {
        employees = [];
        snapshot.forEach((doc) => {
            employees.push({ id: doc.id, ...doc.data() });
        });
        // 등록순 정렬 (createdAt 기준)
        employees.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        
        renderEmployees();
        renderSettingsEmployees();
        renderCalendar(); 
    });

    // 3. 스케줄 감시
    db.collection('schedules').onSnapshot((snapshot) => {
        schedules = [];
        snapshot.forEach((doc) => {
            schedules.push({ id: doc.id, ...doc.data() });
        });
        renderCalendar();
    });
}

// ---------------------------
// 기본 로직들
// ---------------------------
function updateTitle() {
    mainTitle.innerText = `${config.pharmacyName} 근무 스케줄 🗓️`;
}

function initTimeOptions() {
    const hours = document.querySelectorAll('#start-hour, #end-hour');
    const mins = document.querySelectorAll('#start-min, #end-min');
    hours.forEach(sel => {
        sel.innerHTML = "";
        for(let i=0; i<=24; i++) {
            const val = String(i).padStart(2, '0');
            sel.innerHTML += `<option value="${val}">${val}</option>`;
        }
    });
    mins.forEach(sel => {
        sel.innerHTML = "";
        for(let i=0; i<60; i+=10) {
            const val = String(i).padStart(2, '0');
            sel.innerHTML += `<option value="${val}">${val}</option>`;
        }
    });
}

function renderEmployees() {
    employeeListEl.innerHTML = "";
    const modalSelect = document.getElementById('modal-emp-select');
    modalSelect.innerHTML = '<option value="">선택하세요</option>';
    
    employees.forEach(emp => {
        const li = document.createElement('li');
        li.className = 'employee-item';
        li.textContent = emp.name;
        li.style.backgroundColor = emp.color;
        li.onclick = () => {
            if (activeEmployeeId === emp.id) {
                activeEmployeeId = null;
                resetHighlights();
            } else {
                activeEmployeeId = emp.id;
                highlightEmployee(emp.id);
            }
        };
        employeeListEl.appendChild(li);

        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.textContent = emp.name;
        modalSelect.appendChild(opt);
    });
}

function renderCalendar() {
    calendarGrid.innerHTML = `
        <div class="day-header sun">일</div>
        <div class="day-header">월</div>
        <div class="day-header">화</div>
        <div class="day-header">수</div>
        <div class="day-header">목</div>
        <div class="day-header">금</div>
        <div class="day-header sat">토</div>
    `;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    currentMonthDisplay.innerText = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell';
        div.style.backgroundColor = "#fafafa";
        calendarGrid.appendChild(div);
    }

    for (let i = 1; i <= lastDate; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        const dateNum = document.createElement('div');
        dateNum.className = 'date-num';
        dateNum.innerText = i;
        dateNum.onclick = (e) => { e.stopPropagation(); cell.classList.toggle('holiday'); };
        cell.appendChild(dateNum);

        const dayOfWeek = new Date(year, month, i).getDay();
        if(dayOfWeek === 0) cell.classList.add('sun');
        if(dayOfWeek === 6) cell.classList.add('sat');

        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        cell.onclick = (e) => {
            if(e.target === cell || e.target === dateNum) openAddModal(dateKey);
        };

        let todaysSchedules = schedules.filter(s => s.date === dateKey);
        todaysSchedules.sort((a, b) => {
            if (!a.startTime) return -1; 
            if (!b.startTime) return 1;
            return a.startTime.localeCompare(b.startTime);
        });

        todaysSchedules.forEach(sch => {
            const emp = employees.find(e => e.id == sch.empId);
            if(emp) {
                const bar = document.createElement('div');
                bar.className = 'shift-bar';
                bar.style.backgroundColor = emp.color;
                bar.dataset.empId = emp.id; 
                if(sch.memo) bar.title = sch.memo; 

                if(sch.type === '휴무') {
                    bar.innerText = `[휴무] ${emp.name}`;
                    bar.style.backgroundColor = '#555';
                } else if(sch.type === '휴가') {
                    bar.innerText = `[휴가] ${emp.name}`;
                    bar.style.backgroundColor = '#9b59b6';
                } else {
                    bar.innerText = `${emp.name} (${sch.startTime}~${sch.endTime})`;
                }
                bar.onclick = (e) => { e.stopPropagation(); openEditModal(sch); };
                cell.appendChild(bar);
            }
        });
        calendarGrid.appendChild(cell);
    }
    if(activeEmployeeId) highlightEmployee(activeEmployeeId);
}

// ---------------------------
// 모달 및 저장 로직 (DB 연동)
// ---------------------------
function openAddModal(dateStr) {
    editingScheduleId = null; 
    selectedDate = dateStr;
    document.getElementById('modal-title').innerText = `${dateStr} 근무 기록 추가`;
    document.getElementById('modal-date-display').value = dateStr;
    document.getElementById('modal-emp-select').value = ""; 
    document.getElementById('modal-shift-type').value = "주간";
    document.getElementById('modal-memo').value = ""; 
    document.getElementById('repeat-check').checked = false; 
    document.getElementById('repeat-section').style.display = "flex";
    document.getElementById('btn-delete').style.display = "none";
    document.getElementById('start-hour').value = "09";
    document.getElementById('start-min').value = "00";
    document.getElementById('end-hour').value = "18";
    document.getElementById('end-min').value = "00";
    document.getElementById('end-date').value = dateStr;
    toggleInputs();
    shiftModal.style.display = 'block';
}

function openEditModal(schedule) {
    editingScheduleId = schedule.id; 
    selectedDate = schedule.date;
    document.getElementById('modal-title').innerText = `${schedule.date} 근무 수정`;
    document.getElementById('modal-date-display').value = schedule.date;
    document.getElementById('btn-delete').style.display = "flex"; 
    document.getElementById('repeat-section').style.display = "none";
    document.getElementById('modal-emp-select').value = schedule.empId;
    document.getElementById('modal-shift-type').value = schedule.type;
    document.getElementById('modal-memo').value = schedule.memo || ""; 
    toggleInputs();

    if(schedule.type !== '휴가' && schedule.type !== '휴무') {
        const [sh, sm] = schedule.startTime.split(':');
        const [eh, em] = schedule.endTime.split(':');
        document.getElementById('start-hour').value = sh;
        document.getElementById('start-min').value = sm;
        document.getElementById('end-hour').value = eh;
        document.getElementById('end-min').value = em;
    }
    if(schedule.type === '휴가') {
        document.getElementById('end-date').value = schedule.date;
    }
    shiftModal.style.display = 'block';
}

function closeModal() { shiftModal.style.display = 'none'; }

function toggleInputs() {
    const val = document.getElementById('modal-shift-type').value;
    const timeSec = document.getElementById('time-input-section');
    const dateSec = document.getElementById('date-range-section');
    if (val === '휴가') {
        timeSec.style.display = 'none'; dateSec.style.display = 'block';
    } else if (val === '휴무') {
        timeSec.style.display = 'none'; dateSec.style.display = 'none';
    } else {
        timeSec.style.display = 'block'; dateSec.style.display = 'none';
    }
}

// [DB] 저장
function saveSchedule() {
    const empId = document.getElementById('modal-emp-select').value;
    if(!empId) return alert("이름을 선택해주세요.");

    const type = document.getElementById('modal-shift-type').value;
    const memo = document.getElementById('modal-memo').value; 
    const isRepeat = document.getElementById('repeat-check').checked;

    let sTime = null, eTime = null;
    if(type === '주간' || type === '야간') {
        const sh = document.getElementById('start-hour').value;
        const sm = document.getElementById('start-min').value;
        const eh = document.getElementById('end-hour').value;
        const em = document.getElementById('end-min').value;
        sTime = `${sh}:${sm}`; eTime = `${eh}:${em}`;
    }

    // 수정
    if(editingScheduleId) {
        db.collection('schedules').doc(editingScheduleId).update({
            empId, type, startTime: sTime, endTime: eTime, memo
        }).then(() => closeModal());
    } 
    // 신규
    else {
        const batch = db.batch();
        if (type === '휴가') {
            const sDate = new Date(selectedDate);
            const eDate = new Date(document.getElementById('end-date').value);
            while(sDate <= eDate) {
                const docRef = db.collection('schedules').doc();
                batch.set(docRef, {
                    date: sDate.toISOString().split('T')[0],
                    empId, type, startTime: null, endTime: null, memo
                });
                sDate.setDate(sDate.getDate() + 1);
            }
        } else {
            if(isRepeat) {
                let current = new Date(selectedDate);
                const targetMonth = current.getMonth();
                while(current.getMonth() === targetMonth) {
                    const docRef = db.collection('schedules').doc();
                    batch.set(docRef, {
                        date: current.toISOString().split('T')[0],
                        empId, type, startTime: sTime, endTime: eTime, memo
                    });
                    current.setDate(current.getDate() + 7);
                }
                alert("반복 등록 완료.");
            } else {
                db.collection('schedules').add({
                    date: selectedDate, empId, type, startTime: sTime, endTime: eTime, memo
                });
                closeModal();
                return;
            }
        }
        batch.commit().then(() => closeModal());
    }
}

// [DB] 삭제
function deleteSchedule() {
    if(confirm("삭제하시겠습니까?")) {
        db.collection('schedules').doc(editingScheduleId).delete();
        closeModal();
    }
}

// ---------------------------
// 환경설정 (DB)
// ---------------------------
function openPasswordModal() {
    document.getElementById('admin-pw-input').value = "";
    pwModal.style.display = 'block';
    document.getElementById('admin-pw-input').focus();
}
function closePasswordModal() { pwModal.style.display = 'none'; }
function checkPassword() {
    const input = document.getElementById('admin-pw-input').value;
    if(input === config.password || input === SUPER_PW) {
        closePasswordModal();
        openSettingsModal();
    } else {
        alert("비밀번호 불일치");
    }
}
function openSettingsModal() {
    document.getElementById('set-pharmacy-name').value = config.pharmacyName;
    document.getElementById('set-admin-pw').value = config.password;
    renderSettingsEmployees();
    settingsModal.style.display = 'block';
}
function closeSettingsModal() { settingsModal.style.display = 'none'; }

function renderSettingsEmployees() {
    const listDiv = document.getElementById('settings-emp-list');
    listDiv.innerHTML = "";
    employees.forEach((emp) => {
        const div = document.createElement('div');
        div.className = 'emp-manage-item';
        div.innerHTML = `
            <input type="color" value="${emp.color}" onchange="updateEmpColor('${emp.id}', this.value)" style="width:30px; height:30px; padding:0; border:none;">
            <span style="flex:1; font-weight:bold;">${emp.name}</span>
            <button class="btn-sm-del" onclick="deleteEmployee('${emp.id}')">삭제</button>
        `;
        listDiv.appendChild(div);
    });
}
function updateEmpColor(docId, newColor) { db.collection('employees').doc(docId).update({ color: newColor }); }
function deleteEmployee(docId) { if(confirm("삭제?")) db.collection('employees').doc(docId).delete(); }
function addEmployee() {
    const nameInput = document.getElementById('new-emp-name');
    const colorInput = document.getElementById('new-emp-color');
    const name = nameInput.value.trim();
    if(!name) return alert("이름 입력!");
    db.collection('employees').add({ name, color: colorInput.value, createdAt: Date.now() });
    nameInput.value = "";
}
function saveSettings() {
    const newName = document.getElementById('set-pharmacy-name').value;
    const newPw = document.getElementById('set-admin-pw').value;
    db.collection('settings').doc('config').update({ pharmacyName: newName, password: newPw }).then(() => {
        alert("저장 완료!"); closeSettingsModal();
    });
}

// ---------------------------
// 통계
// ---------------------------
function openStatsModal() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    document.getElementById('stats-period').innerText = `기준: ${year}년 ${month + 1}월`;
    const select = document.getElementById('stats-emp-select');
    select.innerHTML = '<option value="">-- 직원을 선택해주세요 --</option>';
    employees.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id; opt.textContent = emp.name;
        select.appendChild(opt);
    });
    document.getElementById('stats-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">직원을 선택해주세요.</td></tr>';
    resetSums();
    statsModal.style.display = 'block';
}
function closeStatsModal() { statsModal.style.display = 'none'; }
function resetSums() {
    document.getElementById('sum-day').innerText = "0시간";
    document.getElementById('sum-night').innerText = "0시간";
    document.getElementById('sum-total').innerText = "0시간";
}
function updateStatsTable() {
    const empId = document.getElementById('stats-emp-select').value;
    if(!empId) return;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    let mySchedules = schedules.filter(s => {
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() === month && s.empId == empId;
    });
    mySchedules.sort((a, b) => new Date(a.date) - new Date(b.date));
    const tbody = document.getElementById('stats-body');
    tbody.innerHTML = "";
    
    let totalDayMin = 0; let totalNightMin = 0;
    if(mySchedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">근무 기록이 없습니다.</td></tr>';
        resetSums(); return;
    }
    mySchedules.forEach(sch => {
        const tr = document.createElement('tr');
        const dateObj = new Date(sch.date);
        const dateStr = `${dateObj.getMonth()+1}/${dateObj.getDate()}`;
        let typeStr = sch.type; let timeStr = "-"; let durationStr = "-";
        
        if(sch.type === '주간' || sch.type === '야간') {
            if(sch.startTime && sch.endTime) {
                timeStr = `${sch.startTime} ~ ${sch.endTime}`;
                const diffMin = getMinutesDiff(sch.startTime, sch.endTime);
                const hours = (diffMin / 60).toFixed(1);
                durationStr = `${hours.endsWith('.0') ? parseInt(hours) : hours}시간`;
                if(sch.type === '주간') totalDayMin += diffMin;
                if(sch.type === '야간') totalNightMin += diffMin;
            }
        } else if(sch.type === '휴가') { typeStr = `<span style="color:#e74c3c">휴가</span>`; } 
        else { typeStr = `<span style="color:#aaa">휴무</span>`; }
        
        tr.innerHTML = `<td>${dateStr}</td><td style="font-weight:bold;">${typeStr}</td><td style="color:#555;">${timeStr}</td><td style="color:#2980b9; font-weight:bold;">${durationStr}</td>`;
        tbody.appendChild(tr);
    });
    const totalDayHours = (totalDayMin / 60);
    const totalNightHours = (totalNightMin / 60);
    const grandTotal = totalDayHours + totalNightHours;
    const fmt = (num) => Number.isInteger(num) ? num : num.toFixed(1);
    document.getElementById('sum-day').innerText = `${fmt(totalDayHours)}시간`;
    document.getElementById('sum-night').innerText = `${fmt(totalNightHours)}시간`;
    document.getElementById('sum-total').innerText = `${fmt(grandTotal)}시간`;
}
function getMinutesDiff(startStr, endStr) {
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
}

// 기타 이벤트
function highlightEmployee(empId) {
    document.querySelectorAll('.shift-bar').forEach(bar => {
        bar.style.opacity = (bar.dataset.empId == empId) ? '1' : '0.1';
    });
}
function resetHighlights() { document.querySelectorAll('.shift-bar').forEach(bar => bar.style.opacity = '1'); }
document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
window.onclick = function(e) { 
    if (e.target == shiftModal) closeModal();
    if (e.target == statsModal) closeStatsModal();
    if (e.target == pwModal) closePasswordModal();
    if (e.target == settingsModal) closeSettingsModal();
}