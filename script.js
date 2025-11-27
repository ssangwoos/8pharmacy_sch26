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



// --- 파이어베이스 초기화 ---
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
listenToData(); 

// ==========================================
// 파이어베이스 실시간 리스너
// ==========================================
function listenToData() {
    db.collection('settings').doc('config').onSnapshot((doc) => {
        if (doc.exists) { config = doc.data(); }
        else {
            config = { pharmacyName: "에이트약국", password: "0000" };
            db.collection('settings').doc('config').set(config);
        }
        updateTitle();
    });

    db.collection('employees').onSnapshot((snapshot) => {
        employees = [];
        snapshot.forEach((doc) => { employees.push({ id: doc.id, ...doc.data() }); });
        employees.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderEmployees();
        renderSettingsEmployees();
        renderCalendar();
    });

    db.collection('schedules').onSnapshot((snapshot) => {
        schedules = [];
        snapshot.forEach((doc) => { schedules.push({ id: doc.id, ...doc.data() }); });
        renderCalendar();
    });
}

// ---------------------------
// 기본 로직
// ---------------------------
function updateTitle() { mainTitle.innerText = `${config.pharmacyName} 근무 스케줄 🗓️`; }

function initTimeOptions() {
    const hours = document.querySelectorAll('#start-hour, #end-hour');
    const mins = document.querySelectorAll('#start-min, #end-min');
    hours.forEach(sel => {
        sel.innerHTML = "";
        for(let i=0; i<=24; i++) { sel.innerHTML += `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`; }
    });
    mins.forEach(sel => {
        sel.innerHTML = "";
        for(let i=0; i<60; i+=10) { sel.innerHTML += `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`; }
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
            if (activeEmployeeId === emp.id) { activeEmployeeId = null; resetHighlights(); }
            else { activeEmployeeId = emp.id; highlightEmployee(emp.id); }
        };
        employeeListEl.appendChild(li);
        const opt = document.createElement('option');
        opt.value = emp.id; opt.textContent = emp.name;
        modalSelect.appendChild(opt);
    });
}

// script.js 안에 있는 renderCalendar 함수만 이걸로 교체하세요

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

    // 1. 빈 칸 채우기
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell empty';
        calendarGrid.appendChild(div);
    }

    // 2. 날짜 채우기
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
                
                // ★★★ 여기가 핵심 수정 포인트입니다 ★★★
                // 1. 색상은 무조건 직원의 색상을 따릅니다. (강제 지정 코드 삭제됨)
                bar.style.backgroundColor = emp.color; 
                
                bar.dataset.empId = emp.id;
                if(sch.memo) bar.title = sch.memo; 

                // 2. 텍스트 내용만 구분합니다.
                if(sch.type === '휴무') {
                    bar.innerText = `[휴무] ${emp.name}`;
                } else if(sch.type === '휴가') {
                    bar.innerText = `[휴가] ${emp.name}`;
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
// 모달 및 DB 저장 로직
// ---------------------------
function openAddModal(dateStr) {
    editingScheduleId = null; selectedDate = dateStr;
    document.getElementById('modal-title').innerText = `${dateStr} 근무 추가`;
    document.getElementById('modal-date-display').value = dateStr;
    document.getElementById('modal-emp-select').value = ""; 
    document.getElementById('modal-shift-type').value = "주간";
    document.getElementById('modal-memo').value = ""; 
    document.getElementById('repeat-check').checked = false; 
    document.getElementById('repeat-section').style.display = "flex";
    document.getElementById('btn-delete').style.display = "none";
    document.getElementById('start-hour').value = "09"; document.getElementById('start-min').value = "00";
    document.getElementById('end-hour').value = "18"; document.getElementById('end-min').value = "00";
    document.getElementById('end-date').value = dateStr;
    toggleInputs(); shiftModal.style.display = 'block';
}
function openEditModal(sch) {
    editingScheduleId = sch.id; selectedDate = sch.date;
    document.getElementById('modal-title').innerText = `${sch.date} 근무 수정`;
    document.getElementById('modal-date-display').value = sch.date;
    document.getElementById('btn-delete').style.display = "flex"; 
    document.getElementById('repeat-section').style.display = "none";
    document.getElementById('modal-emp-select').value = sch.empId;
    document.getElementById('modal-shift-type').value = sch.type;
    document.getElementById('modal-memo').value = sch.memo || ""; 
    toggleInputs();
    if(sch.type !== '휴가' && sch.type !== '휴무') {
        const [sh, sm] = sch.startTime.split(':'); const [eh, em] = sch.endTime.split(':');
        document.getElementById('start-hour').value = sh; document.getElementById('start-min').value = sm;
        document.getElementById('end-hour').value = eh; document.getElementById('end-min').value = em;
    }
    if(sch.type === '휴가') { document.getElementById('end-date').value = sch.date; }
    shiftModal.style.display = 'block';
}
function closeModal() { shiftModal.style.display = 'none'; }
function toggleInputs() {
    const val = document.getElementById('modal-shift-type').value;
    const timeSec = document.getElementById('time-input-section');
    const dateSec = document.getElementById('date-range-section');
    timeSec.style.display = (val === '주간' || val === '야간') ? 'block' : 'none';
    dateSec.style.display = (val === '휴가') ? 'block' : 'none';
}

function saveSchedule() {
    const empId = document.getElementById('modal-emp-select').value;
    if(!empId) return alert("이름을 선택해주세요.");
    const type = document.getElementById('modal-shift-type').value;
    const memo = document.getElementById('modal-memo').value; 
    const isRepeat = document.getElementById('repeat-check').checked;
    let sTime = null, eTime = null;
    if(type === '주간' || type === '야간') {
        sTime = `${document.getElementById('start-hour').value}:${document.getElementById('start-min').value}`;
        eTime = `${document.getElementById('end-hour').value}:${document.getElementById('end-min').value}`;
    }

    if(editingScheduleId) {
        db.collection('schedules').doc(editingScheduleId).update({ empId, type, startTime: sTime, endTime: eTime, memo }).then(() => closeModal());
    } else {
        const batch = db.batch();
        if (type === '휴가') {
            let sDate = new Date(selectedDate); const eDate = new Date(document.getElementById('end-date').value);
            while(sDate <= eDate) {
                batch.set(db.collection('schedules').doc(), { date: sDate.toISOString().split('T')[0], empId, type, startTime: null, endTime: null, memo });
                sDate.setDate(sDate.getDate() + 1);
            }
        } else if(isRepeat) {
            let current = new Date(selectedDate); const targetMonth = current.getMonth();
            while(current.getMonth() === targetMonth) {
                batch.set(db.collection('schedules').doc(), { date: current.toISOString().split('T')[0], empId, type, startTime: sTime, endTime: eTime, memo });
                current.setDate(current.getDate() + 7);
            }
            alert("반복 등록 완료.");
        } else {
            db.collection('schedules').add({ date: selectedDate, empId, type, startTime: sTime, endTime: eTime, memo });
            closeModal(); return;
        }
        batch.commit().then(() => closeModal());
    }
}
function deleteSchedule() { if(confirm("삭제?")) { db.collection('schedules').doc(editingScheduleId).delete(); closeModal(); }}

// ---------------------------
// 환경설정 & 통계 & 기타
// ---------------------------
function openPasswordModal() { document.getElementById('admin-pw-input').value = ""; pwModal.style.display = 'block'; document.getElementById('admin-pw-input').focus(); }
function closePasswordModal() { pwModal.style.display = 'none'; }
function checkPassword() {
    const input = document.getElementById('admin-pw-input').value;
    if(input === config.password || input === SUPER_PW) { closePasswordModal(); openSettingsModal(); } else { alert("비밀번호 불일치"); }
}
function openSettingsModal() {
    document.getElementById('set-pharmacy-name').value = config.pharmacyName; document.getElementById('set-admin-pw').value = config.password;
    renderSettingsEmployees(); settingsModal.style.display = 'block';
}
function closeSettingsModal() { settingsModal.style.display = 'none'; }
function renderSettingsEmployees() {
    const listDiv = document.getElementById('settings-emp-list'); listDiv.innerHTML = "";
    employees.forEach((emp) => {
        const div = document.createElement('div'); div.className = 'emp-manage-item';
        div.innerHTML = `<input type="color" value="${emp.color}" onchange="updateEmpColor('${emp.id}', this.value)" style="width:30px;height:30px;padding:0;border:none;"><span style="flex:1;font-weight:bold;">${emp.name}</span><button class="btn-sm-del" onclick="deleteEmployee('${emp.id}')">삭제</button>`;
        listDiv.appendChild(div);
    });
}
function updateEmpColor(id, color) { db.collection('employees').doc(id).update({ color }); }
function deleteEmployee(id) { if(confirm("삭제?")) db.collection('employees').doc(id).delete(); }
function addEmployee() {
    const name = document.getElementById('new-emp-name').value.trim();
    if(!name) return alert("이름 입력!");
    db.collection('employees').add({ name, color: document.getElementById('new-emp-color').value, createdAt: Date.now() });
    document.getElementById('new-emp-name').value = "";
}
function saveSettings() {
    db.collection('settings').doc('config').update({ pharmacyName: document.getElementById('set-pharmacy-name').value, password: document.getElementById('set-admin-pw').value })
    .then(() => { alert("저장 완료!"); closeSettingsModal(); });
}

function openStatsModal() {
    const Y=currentDate.getFullYear(), M=currentDate.getMonth(); document.getElementById('stats-period').innerText = `기준: ${Y}년 ${M+1}월`;
    const sel = document.getElementById('stats-emp-select'); sel.innerHTML = '<option value="">-- 선택 --</option>';
    employees.forEach(e => sel.innerHTML += `<option value="${e.id}">${e.name}</option>`);
    document.getElementById('stats-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">직원을 선택해주세요.</td></tr>';
    resetSums(); statsModal.style.display = 'block';
}
function closeStatsModal() { statsModal.style.display = 'none'; }
function resetSums() { document.getElementById('sum-day').innerText="0시간"; document.getElementById('sum-night').innerText="0시간"; document.getElementById('sum-total').innerText="0시간"; }
function updateStatsTable() {
    const empId = document.getElementById('stats-emp-select').value; if(!empId) return;
    const Y=currentDate.getFullYear(), M=currentDate.getMonth();
    let mySch = schedules.filter(s => { const d=new Date(s.date); return d.getFullYear()===Y && d.getMonth()===M && s.empId==empId; });
    mySch.sort((a,b)=>new Date(a.date)-new Date(b.date));
    const tbody = document.getElementById('stats-body'); tbody.innerHTML = "";
    let tDay=0, tNight=0;
    if(mySch.length===0) { tbody.innerHTML='<tr><td colspan="4" style="text-align:center;">기록 없음</td></tr>'; resetSums(); return; }
    mySch.forEach(sch => {
        const tr = document.createElement('tr'); const d=new Date(sch.date);
        let typeStr=sch.type, timeStr="-", durStr="-";
        if(sch.type==='주간'||sch.type==='야간') {
            if(sch.startTime){
                timeStr=`${sch.startTime}~${sch.endTime}`;
                const diff = (parseInt(sch.endTime.split(':')[0])*60+parseInt(sch.endTime.split(':')[1])) - (parseInt(sch.startTime.split(':')[0])*60+parseInt(sch.startTime.split(':')[1]));
                durStr = `${(diff/60).toFixed(1).replace('.0','')}시간`;
                if(sch.type==='주간') tDay+=diff; else tNight+=diff;
            }
        } else if(sch.type==='휴가') typeStr='<span style="color:#e74c3c">휴가</span>'; else typeStr='<span style="color:#aaa">휴무</span>';
        tr.innerHTML = `<td>${d.getMonth()+1}/${d.getDate()}</td><td style="font-weight:bold;">${typeStr}</td><td style="color:#555;">${timeStr}</td><td style="color:#2980b9;font-weight:bold;">${durStr}</td>`;
        tbody.appendChild(tr);
    });
    document.getElementById('sum-day').innerText = `${(tDay/60).toFixed(1).replace('.0','')}시간`;
    document.getElementById('sum-night').innerText = `${(tNight/60).toFixed(1).replace('.0','')}시간`;
    document.getElementById('sum-total').innerText = `${((tDay+tNight)/60).toFixed(1).replace('.0','')}시간`;
}

function highlightEmployee(id) { document.querySelectorAll('.shift-bar').forEach(b => b.style.opacity = (b.dataset.empId == id) ? '1' : '0.1'); }
function resetHighlights() { document.querySelectorAll('.shift-bar').forEach(b => b.style.opacity = '1'); }
document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
window.onclick = (e) => { if(e.target==shiftModal)closeModal(); if(e.target==statsModal)closeStatsModal(); if(e.target==pwModal)closePasswordModal(); if(e.target==settingsModal)closeSettingsModal(); }