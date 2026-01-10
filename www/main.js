import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; 

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDrjV87NqtWAD610oPnia_sbgVZOYcEoH0",
  authDomain: "leavemanageruk.firebaseapp.com",
  projectId: "leavemanageruk",
  storageBucket: "leavemanageruk.firebasestorage.app",
  messagingSenderId: "61077377680",
  appId: "1:61077377680:web:6369eef3114f17381f7e15",
  measurementId: "G-V5NDJPNSCZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Variables
let currentUser = null;
let leaveHistory = [];
let earnedPratikar = []; 
let manualCredits = {};  
let myNotes = [];
let userProfile = {}; 
let selectedDashboardYear = new Date().getFullYear(); 
let wrongPinAttempts = 0; 

// --- 2. AUTH FUNCTIONS (LOGIN & REGISTER) ---

// रजिस्ट्रेशन फंक्शन (नया यूजर)
window.emailSignup = function() {
    const e = document.getElementById('user-email').value;
    const p = document.getElementById('user-pass').value;

    if(!e || !p) return alert("कृपया Email और Password दोनों भरें।");
    if(p.length < 6) return alert("पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।");

    // यूजर को बतायें कि काम हो रहा है
    // alert("रजिस्टर हो रहा है, कृपया प्रतीक्षा करें...");

    createUserWithEmailAndPassword(auth, e, p)
        .then((userCredential) => {
            alert("सफलतापूर्वक रजिस्टर हो गया!\nअब आपका खाता बन गया है।");
            // इसके बाद onAuthStateChanged अपने आप लॉगिन कर देगा
        })
        .catch((error) => {
            let msg = error.message;
            if(error.code === 'auth/email-already-in-use') msg = "यह ईमेल पहले से रजिस्टर्ड है। कृपया लॉगिन करें।";
            alert("Registration Failed:\n" + msg);
        });
}

// लॉगिन फंक्शन (पुराना यूजर)
window.emailLogin = function() {
    const e = document.getElementById('user-email').value;
    const p = document.getElementById('user-pass').value;

    if(!e || !p) return alert("Email और Password दोनों भरें।");

    signInWithEmailAndPassword(auth, e, p)
        .then((userCredential) => {
            console.log("Login Successful");
            // onAuthStateChanged अपने आप ऐप खोल देगा
        })
        .catch((error) => {
            alert("Login Failed: ईमेल या पासवर्ड गलत है।");
        });
}

// लॉगआउट फंक्शन
window.logoutApp = function() {
    signOut(auth).then(() => {
        // alert("लॉग आउट किया गया।");
        location.reload(); 
    });
}

// --- 3. AUTH STATE LISTENER (APP CONTROLLER) ---
onAuthStateChanged(auth, async (user) => {
    const loginForm = document.getElementById("login-form");
    const userInfo = document.getElementById("user-info");
    const emailDisplay = document.getElementById("user-email-display");

    if (user) {
        // --- अगर यूजर लॉग इन है ---
        currentUser = user;
        
        // लॉगिन स्क्रीन छुपाएं, ऐप दिखाएं
        if(loginForm) loginForm.style.display = "none";
        if(userInfo) userInfo.style.display = "block";
        if(emailDisplay) emailDisplay.innerText = user.email.split('@')[0];

        // डेटा लोड करें (Firebase से)
        await loadUserData(user.uid);
    } else {
        // --- अगर यूजर लॉग आउट है ---
        if(loginForm) loginForm.style.display = "flex";
        if(userInfo) userInfo.style.display = "none";
        
        // डेटा लोड करें (Local Storage से - Offline Mode)
        loadOfflineData();
    }

    // UI को रिफ्रेश करें
    refreshAll();
    injectVerificationModal();
    checkDailyNotifications();
});

// --- 4. DATA HANDLING ---
async function loadUserData(uid) {
    try {
        const docSnap = await getDoc(doc(db, "users", uid));
        if (docSnap.exists()) {
            const data = docSnap.data();
            leaveHistory = data.history || [];
            earnedPratikar = data.pratikar || [];
            manualCredits = data.credits || {};
            userProfile = data.profile || {};
            myNotes = data.notes || [];
        }
    } catch (e) { 
        console.error("Data Load Error:", e);
    }
}

function loadOfflineData() {
    leaveHistory = JSON.parse(localStorage.getItem('uk_history')) || [];
    earnedPratikar = JSON.parse(localStorage.getItem('uk_pratikar')) || [];
    manualCredits = JSON.parse(localStorage.getItem('uk_credits')) || {};
    userProfile = JSON.parse(localStorage.getItem('uk_profile')) || {};
    myNotes = JSON.parse(localStorage.getItem('uk_notes')) || [];
}

async function saveData() {
    // Local Save
    localStorage.setItem('uk_history', JSON.stringify(leaveHistory));
    localStorage.setItem('uk_pratikar', JSON.stringify(earnedPratikar));
    localStorage.setItem('uk_credits', JSON.stringify(manualCredits));
    localStorage.setItem('uk_profile', JSON.stringify(userProfile));
    localStorage.setItem('uk_notes', JSON.stringify(myNotes));
    
    // Cloud Save (अगर यूजर लॉगिन है)
    if (currentUser) {
        await setDoc(doc(db, "users", currentUser.uid), { 
            history: leaveHistory, pratikar: earnedPratikar, credits: manualCredits, profile: userProfile, notes: myNotes 
        });
    }
}

// --- 5. APP LOGIC & UI ---
const leaveConfig = {
    "CL": { name: "आकस्मिक (CL)", type: "SHORT", quota: 14, format: "YEARLY", excludeHolidays: true },
    "Pratikar": { name: "प्रतिकर अवकाश", type: "SHORT", quota: 0, format: "MANUAL", excludeHolidays: true },
    "EL": { name: "अर्जित (EL)", type: "LONG", quota: 0, format: "SERVICE_BOOK", excludeHolidays: false },
    "SplCasual": { name: "विशेष (Spl)", type: "LONG", quota: 0, format: "SERVICE_BOOK", excludeHolidays: true }, 
    "ML": { name: "चिकित्सा (ML)", type: "LONG", quota: 0, format: "FIXED_QUOTA", excludeHolidays: false },
    "CCL": { name: "बाल्य देखभाल (CCL)", type: "LONG", quota: 0, format: "FIXED_QUOTA", excludeHolidays: false },
    "Maternity": { name: "मातृत्व", type: "LONG", quota: 0, format: "FIXED_QUOTA", excludeHolidays: false },
    "Paternity": { name: "पितृत्व", type: "LONG", quota: 0, format: "FIXED_QUOTA", excludeHolidays: false }
};

function getIndDate(isoDate) {
    if(!isoDate) return "";
    let p = isoDate.split('-');
    return `${p[2]}-${p[1]}-${p[0]}`;
}

function refreshAll() { 
    populateCalendarDropdowns();
    populateYearSelector(); 
    renderHeaderHolidays();
    renderCalendar(); 
    renderDashboard(); 
    renderNotes(); 
    setSection('short');
}

// --- HOLIDAYS ---
const fullHolidaysBase = {
    "01-14": "मकर संक्राति",
    "01-23": "बसन्त पंचमी",
    "01-26": "गणतन्त्र दिवस",
    "02-01": "गुरु रविदास जन्मदिवस",
    "02-03": "शब ए बारात*",
    "02-15": "महाशिव रात्रि",
    "03-03": "होलिका दहन",
    "03-04": "होली",
    "03-13": "जमात-उल-विदा*",
    "03-19": "चेटीचंद",
    "03-21": "ईद-उल-फितर*",
    "03-26": "रामनवमी",
    "03-31": "महावीर जयन्ती",
    "04-03": "गुड फ्राइडे",
    "04-14": "अम्बेडकर जयंती",
    "05-01": "बुद्ध पूर्णिमा",
    "05-03": "वीर केशरीचन्द शहीद दिवस",
    "05-27": "ईद-उल-जुहा (बकरीद)*",
    "06-26": "मोहर्रम*",
    "07-16": "हरेला",
    "08-04": "चैहल्लुम*",
    "08-15": "स्वतन्त्रता दिवस",
    "08-26": "ईद ए मिलाद / बारावफात*",
    "08-28": "रक्षा बन्धन",
    "09-04": "जन्माष्टमी",
    "09-17": "विश्व कर्मा पूजा",
    "09-25": "अनन्त चतुर्दशी",
    "10-02": "महात्मा गांधी जयंती",
    "10-11": "महाराजा अग्रसेन जयंती",
    "10-20": "दशहरा (विजयदशमी)",
    "10-26": "महर्षि बाल्मिकी जयंती",
    "11-07": "दीपावली (नरक चतुर्दशी)",
    "11-08": "दीपावली",
    "11-10": "गोवर्धन पूजा",
    "11-11": "भैयादूज",
    "11-15": "छठ पूजा",
    "11-20": "ईगास-बग्वाल",
    "11-24": "गुरूनानक जयंती",
    "12-25": "क्रिसमस दिवस"
};

const hindiMonths = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
let currDate = new Date(); 
let currMonth = currDate.getMonth(); 
let currYear = currDate.getFullYear(); 

function getHolidayName(dateObj) {
    let d = String(dateObj.getDate()).padStart(2, '0');
    let m = String(dateObj.getMonth() + 1).padStart(2, '0');
    let key = `${m}-${d}`;
    if (fullHolidaysBase[key]) return fullHolidaysBase[key];
    return null;
}

function isHolidayOrSunday(dateObj) {
    let isSun = dateObj.getDay() === 0;
    let d = dateObj.getDate();
    let m = dateObj.getMonth() + 1;
    if(m === 1 && d <= 13) return true; // Winter
    if(m === 6) return true; // Summer
    return (getHolidayName(dateObj) !== null || isSun);
}

window.renderHeaderHolidays = function() {
    let tbody = document.getElementById('header-holiday-table-body');
    let yearToView = currYear; 
    if(tbody) {
        tbody.innerHTML = "";
        tbody.innerHTML += `<tr style="background:#e3f2fd;"><td>01-01-${yearToView} से 13-01-${yearToView}</td><td><b>शीतकालीन अवकाश (13 दिन)</b></td></tr>`;
        Object.keys(fullHolidaysBase).sort().forEach(k => {
            if(!fullHolidaysBase[k].includes("शीतकालीन") && !fullHolidaysBase[k].includes("ग्रीष्मावकाश")) {
                tbody.innerHTML += `<tr><td>${k.split('-')[1]}-${k.split('-')[0]}-${yearToView}</td><td>${fullHolidaysBase[k]}</td></tr>`;
            }
        });
        tbody.innerHTML += `<tr style="background:#fff3e0;"><td>01-06-${yearToView} से 30-06-${yearToView}</td><td><b>ग्रीष्मावकाश (30 दिन)</b></td></tr>`;
    }
}

// --- NOTIFICATIONS ---
window.checkDailyNotifications = function() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") { Notification.requestPermission(); }

    let now = new Date();
    let todayStr = now.toISOString().split('T')[0];
    let currentHour = now.getHours();
    let todayHoliday = getHolidayName(now);
    let todayKey = `notif_today_${todayStr}`;
    
    if (todayHoliday && currentHour >= 6 && !localStorage.getItem(todayKey)) {
        showNotification("आज का अवकाश", `आज ${todayHoliday} का अवकाश है।`);
        localStorage.setItem(todayKey, "true");
    }
}

function showNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, { body: body, icon: "https://cdn-icons-png.flaticon.com/512/2693/2693507.png" });
    }
}

// --- PIN SECURITY ---
window.injectVerificationModal = function() {
    if(document.getElementById('verifyModal')) return;
    let modalHTML = `
    <div id="verifyModal" class="modal" style="z-index:3000;">
        <div class="modal-content" style="padding:20px; text-align:center;">
            <h3 style="color:#c0392b; margin-top:0;"><i class="fas fa-lock"></i> सुरक्षा जाँच</h3>
            <p id="verify-msg" style="font-size:1rem; color:#333; margin:15px 0;">...</p>
            <div id="pin-section">
                <div style="background:#fff3e0; padding:10px; border-radius:5px; margin-bottom:15px;">
                    <label style="display:block; font-size:0.9rem; font-weight:bold;">4 अंकों का PIN डालें:</label>
                    <input type="password" id="verify-pin-input" maxlength="4" style="width:100%; margin-top:5px; text-align:center; font-size:1.5rem; letter-spacing:5px;" placeholder="****">
                </div>
            </div>
            <div id="dob-reset-section" style="display:none; background:#ffebee; padding:10px; border-radius:5px; margin-bottom:15px;">
                <p style="color:red; font-size:0.9rem;">आपने 5 बार गलत PIN डाला।<br>PIN रिसेट करने के लिए जन्मतिथि (DOB) डालें:</p>
                <input type="date" id="verify-dob-reset" style="width:100%;">
            </div>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="btn-reset" onclick="closeVerifyModal()">रद्द करें</button>
                <button class="btn-save" style="background:#c0392b; width:auto;" onclick="confirmResetAction()">Confirm</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

let pendingActionCallback = null;

window.closeVerifyModal = function() {
    document.getElementById('verifyModal').style.display='none';
    wrongPinAttempts = 0; 
    document.getElementById('dob-reset-section').style.display = 'none';
    document.getElementById('pin-section').style.display = 'block';
}

window.verifyAndExecute = function(actionDescription, callback) {
    if(!userProfile.pin) {
        alert("सुरक्षा के लिए कृपया पहले 'प्रोफाइल' में जाकर अपना 4 अंकों का PIN सेट करें।");
        openProfileModal();
        return;
    }
    document.getElementById('verify-msg').innerText = actionDescription;
    document.getElementById('verify-pin-input').value = "";
    document.getElementById('verifyModal').style.display = 'block';
    pendingActionCallback = callback;
}

window.confirmResetAction = function() {
    if(document.getElementById('dob-reset-section').style.display === 'block') {
        let inputDOB = document.getElementById('verify-dob-reset').value;
        if(inputDOB === userProfile.dob) {
            alert("सत्यापन सफल! आपका पुराना PIN हटा दिया गया है। नया PIN सेट करें।");
            userProfile.pin = "";
            saveData(); closeVerifyModal(); openProfileModal();
        } else {
            alert("गलत जन्मतिथि!");
        }
        return;
    }
    let inputPin = document.getElementById('verify-pin-input').value;
    if(inputPin === userProfile.pin) {
        closeVerifyModal();
        if(pendingActionCallback) pendingActionCallback();
    } else {
        wrongPinAttempts++;
        alert(`गलत PIN! (प्रयास: ${wrongPinAttempts}/5)`);
        document.getElementById('verify-pin-input').value = "";
        if(wrongPinAttempts >= 5) {
            document.getElementById('pin-section').style.display = 'none';
            document.getElementById('dob-reset-section').style.display = 'block';
            document.getElementById('verify-msg').innerText = "सुरक्षा अलर्ट: PIN ब्लॉक किया गया।";
        }
    }
}

window.resetAllData = function() {
    verifyAndExecute("सावधान! आपका पूरा डेटा (All Data) हमेशा के लिए मिट जाएगा।", () => {
        leaveHistory = []; earnedPratikar = []; manualCredits = {}; myNotes = [];
        saveData(); refreshAll(); alert("सारा डेटा रिसेट कर दिया गया है।");
    });
}

window.resetSpecificLeave = function(type) {
    let name = leaveConfig[type].name;
    verifyAndExecute(`क्या आप ${name} का पूरा डेटा डिलीट करना चाहते हैं?`, () => {
        leaveHistory = leaveHistory.filter(l => l.type !== type);
        delete manualCredits[type];
        if(type === 'Pratikar') earnedPratikar = [];
        saveData(); 
        if(document.getElementById('ledgerModal').style.display === 'block') renderModalTable(type);
        refreshAll();
        alert(`${name} का डेटा रिसेट हो गया।`);
    });
}

// --- CALENDAR LOGIC ---
window.populateCalendarDropdowns = function() {
    const mSelect = document.getElementById('cal-month-select');
    const ySelect = document.getElementById('cal-year-select');
    if(!mSelect || !ySelect) return;
    if(mSelect.options.length > 0) return;
    mSelect.innerHTML = ""; ySelect.innerHTML = "";
    hindiMonths.forEach((m, i) => { mSelect.innerHTML += `<option value="${i}">${m}</option>`; });
    let startY = 1980; let endY = 2100;
    for(let y = startY; y <= endY; y++) { ySelect.innerHTML += `<option value="${y}">${y}</option>`; }
    mSelect.value = currMonth; ySelect.value = currYear;
}

window.jumpToDate = function() {
    const mSelect = document.getElementById('cal-month-select');
    const ySelect = document.getElementById('cal-year-select');
    currMonth = parseInt(mSelect.value);
    currYear = parseInt(ySelect.value);
    renderCalendar();
}

window.renderCalendar = function() {
    const grid = document.getElementById('calendar-days');
    const hList = document.getElementById('month-holiday-list');
    const mSelect = document.getElementById('cal-month-select');
    const ySelect = document.getElementById('cal-year-select');
    if(mSelect && ySelect) { mSelect.value = currMonth; ySelect.value = currYear; }
    
    if(grid) {
        grid.innerHTML = ""; hList.innerHTML = "";
        let firstDay = new Date(currYear, currMonth, 1).getDay(); 
        let daysInMonth = new Date(currYear, currMonth+1, 0).getDate();
        for(let i=0; i<firstDay; i++) { grid.appendChild(document.createElement('div')); }
        for(let i=1; i<=daysInMonth; i++) {
            let div = document.createElement('div');
            let m=String(currMonth+1).padStart(2,'0'), d=String(i).padStart(2,'0');
            let fDate = `${currYear}-${m}-${d}`;
            let dateObj = new Date(currYear, currMonth, i);
            let hName = getHolidayName(dateObj);
            let isSun = dateObj.getDay() === 0;
            let l = leaveHistory.find(x=>x.date===fDate);

            div.innerHTML = `<span class="date-num">${i}</span>`;
            if(l) { 
                div.classList.add('has-leave'); 
                div.innerHTML += `<div class="event-name">${leaveConfig[l.type]?.name.split(' ')[0] || l.type}</div>`; 
            }
            else if(hName || isSun) { 
                div.classList.add('is-holiday'); 
                div.innerHTML += `<div class="event-name">${hName || "रविवार"}</div>`;
                if(hName) hList.innerHTML += `<li><span style="font-weight:bold;">${getIndDate(fDate)}</span>: ${hName}</li>`;
                else if(isSun) hList.innerHTML += `<li><span style="font-weight:bold;">${getIndDate(fDate)}</span>: रविवार</li>`;
            }
            if(i===new Date().getDate() && currMonth===new Date().getMonth() && currYear===new Date().getFullYear()) div.classList.add('today');
            grid.appendChild(div);
        }
    }
    renderHeaderHolidays();
}

window.changeMonth = function(n) { currMonth+=n; if(currMonth<0){currMonth=11;currYear--} if(currMonth>11){currMonth=0;currYear++} renderCalendar(); }

// --- DASHBOARD LOGIC ---
function getMaxActiveYear() {
    let y = new Date().getFullYear();
    leaveHistory.forEach(l => { if(new Date(l.date).getFullYear() > y) y = new Date(l.date).getFullYear(); });
    return y;
}

window.populateYearSelector = function() {
    let select = document.getElementById('dashboard-year-select');
    if(!select) return;
    let joiningYear = userProfile.appt ? new Date(userProfile.appt).getFullYear() : 2014;
    let endYear = getMaxActiveYear() + 1;
    let oldVal = select.value || new Date().getFullYear();
    select.innerHTML = "";
    for(let y = joiningYear; y <= endYear; y++) { select.innerHTML += `<option value="${y}">${y}</option>`; }
    if(oldVal >= joiningYear && oldVal <= endYear) select.value = oldVal;
    else select.value = new Date().getFullYear();
    selectedDashboardYear = parseInt(select.value);
}

window.updateDashboardYear = function() {
    let select = document.getElementById('dashboard-year-select');
    selectedDashboardYear = parseInt(select.value);
    renderDashboard(); 
}

function calculateStats(type, targetYear) {
    let conf = leaveConfig[type];
    if(type === 'Pratikar') {
        let earned = earnedPratikar.length;
        let used = earnedPratikar.filter(p => p.status === 'Consumed').length;
        return { totalDue: earned, totalUsed: used, balance: earned - used };
    }
    if(conf.format === 'YEARLY') {
        let quota = manualCredits[type]?.[targetYear] || conf.quota; 
        let used = leaveHistory.filter(l => l.type === type && l.date.startsWith(`${targetYear}-`)).length;
        return { totalDue: quota, totalUsed: used, balance: quota - used };
    } 
    else {
        let startY = userProfile.appt ? new Date(userProfile.appt).getFullYear() : 2014;
        let runningBal = 0;
        if(conf.format === 'FIXED_QUOTA' || conf.format === 'DECREMENTAL') runningBal = conf.quota;
        else if(conf.quota > 0) runningBal = conf.quota;

        for(let y = startY; y <= targetYear; y++) {
            if(manualCredits[type] && manualCredits[type][y]) runningBal += manualCredits[type][y];
            let leaves = leaveHistory.filter(l => l.type === type && l.date.startsWith(`${y}-`));
            runningBal -= leaves.length;
        }
        let usedThisYear = leaveHistory.filter(l => l.type === type && l.date.startsWith(`${targetYear}-`)).length;
        let creditThisYear = manualCredits[type]?.[targetYear] || 0;
        let openingThisYear = runningBal + usedThisYear - creditThisYear;
        return { totalDue: openingThisYear + creditThisYear, totalUsed: usedThisYear, balance: runningBal };
    }
}

window.renderDashboard = function() {
    const shortBody = document.getElementById('balance-body-short');
    const longBody = document.getElementById('balance-body-long');
    const historyList = document.getElementById('dashboard-history-list');
    if(!shortBody || !longBody) return;

    shortBody.innerHTML = ""; longBody.innerHTML = "";
    if(historyList) historyList.innerHTML = "";

    Object.keys(leaveConfig).forEach(type => {
        let conf = leaveConfig[type];
        let stats = calculateStats(type, selectedDashboardYear);
        let manageBtn = "";
        if(type === 'Pratikar') manageBtn = `<i class="fas fa-plus-circle manage-icon" onclick="openPratikarModal()"></i>`;
        else manageBtn = `<i class="fas fa-arrow-circle-right manage-icon" onclick="openLedgerModal('${type}')"></i>`;
        
        let row = `<tr>
            <td style="text-align:left; font-weight:bold;">${conf.name}</td>
            <td>${stats.totalDue}</td>
            <td>${stats.totalUsed}</td>
            <td><b>${stats.balance}</b></td>
            <td>${manageBtn}</td>
        </tr>`;
        if(conf.type === 'SHORT') shortBody.innerHTML += row;
        else longBody.innerHTML += row;
    });

    let yearLeaves = leaveHistory.filter(l => l.date.startsWith(`${selectedDashboardYear}-`));
    yearLeaves.sort((a,b)=> new Date(b.date) - new Date(a.date));
    if(yearLeaves.length === 0) historyList.innerHTML = "<li>इस वर्ष कोई अवकाश नहीं लिया।</li>";
    else {
        yearLeaves.forEach(l => {
            let tName = leaveConfig[l.type]?.name.split(' ')[0] || l.type;
            historyList.innerHTML += `<li><b>${getIndDate(l.date)}</b>: ${tName} <span style="color:red;float:right;cursor:pointer;" onclick="deleteLeave('${l.date}')">✖</span></li>`;
        });
    }
}

// --- MODAL MANAGER ---
let currentLeaveType = "";
window.openLedgerModal = function(type) {
    currentLeaveType = type;
    let conf = leaveConfig[type];
    document.getElementById('ledgerModal').style.display = 'flex';
    document.getElementById('modal-leave-name').innerText = conf.name;
    document.getElementById('modal-sub-info').innerText = (conf.format === 'YEARLY') ? "वार्षिक (Yearly)" : "सेवा पंजिका (Service Book)";
    
    let yearSelect = document.getElementById('action-year');
    yearSelect.innerHTML = "";
    let startY = userProfile.appt ? new Date(userProfile.appt).getFullYear() : 2014;
    let endY = getMaxActiveYear() + 1; 
    for(let y=startY; y<=endY; y++) { yearSelect.innerHTML += `<option value="${y}">${y}</option>`; }
    yearSelect.value = selectedDashboardYear; 
    
    switchActionTab('debit'); 
    renderModalTable(type);
}

window.closeLedgerModal = function() {
    document.getElementById('ledgerModal').style.display = 'none';
    refreshAll();
}

window.switchActionTab = function(tab) {
    document.querySelectorAll('.action-tab').forEach(t => t.classList.remove('active-tab'));
    document.getElementById(`tab-${tab}`).classList.add('active-tab');
    
    let conf = leaveConfig[currentLeaveType];
    let creditText = document.getElementById('tab-credit-text');
    let formCredit = document.getElementById('form-credit');
    formCredit.innerHTML = ""; 

    if(tab === 'credit') {
        if(conf.format === 'FIXED_QUOTA') {
            formCredit.innerHTML = `
                <div style="display:flex; gap:8px; align-items:center;">
                    <div style="flex:1;">
                        <label class="input-label">कुल कोटा दिन:</label>
                        <input type="number" id="action-val" placeholder="Ex: 180" style="padding:10px;">
                    </div>
                </div>
                <button class="btn-save" style="margin-top:10px; background:#27ae60;" onclick="submitCreditEntry()">अपडेट करें</button>
            `;
        } 
        else {
            let yearOptions = "";
            let startY = userProfile.appt ? new Date(userProfile.appt).getFullYear() : 2014;
            let endY = getMaxActiveYear() + 1;
            for(let y=startY; y<=endY; y++) yearOptions += `<option value="${y}">${y}</option>`;
            
            formCredit.innerHTML = `
                <div style="display:flex; gap:8px; align-items:center;">
                    <div id="credit-year-box" style="flex:1;">
                        <label class="input-label">किस वर्ष के लिए:</label>
                        <select id="action-year" style="width:100%; padding:10px; border-radius:5px;">${yearOptions}</select>
                    </div>
                    <div style="flex:1;">
                        <label class="input-label">कुल दिन (Days):</label>
                        <input type="number" id="action-val" placeholder="Ex: 14" style="padding:10px;">
                    </div>
                </div>
                <button class="btn-save" style="margin-top:10px; background:#27ae60;" onclick="submitCreditEntry()">अपडेट करें</button>
            `;
            if(document.getElementById('action-year')) document.getElementById('action-year').value = selectedDashboardYear;
        }
        document.getElementById('form-debit').style.display = 'none';
        formCredit.style.display = 'block';
    } else {
        document.getElementById('form-debit').style.display = 'block';
        formCredit.style.display = 'none';
    }
}

function renderModalTable(type) {
    let conf = leaveConfig[type];
    let tbody = document.getElementById('sb-tbody');
    tbody.innerHTML = "";

    if(conf.format === 'YEARLY') {
        document.getElementById('sb-thead').innerHTML = `<tr><th>दिनांक</th><th>विवरण</th><th>Action</th></tr>`;
        let leaves = leaveHistory.filter(l => l.type === type && l.date.startsWith(`${selectedDashboardYear}-`));
        leaves.sort((a,b)=> new Date(a.date) - new Date(b.date));
        leaves.forEach(l => {
            let delAction = `deleteLeave('${l.date}')`; 
            tbody.innerHTML += `<tr><td>${getIndDate(l.date)}</td><td>1 दिन</td><td><i class="fas fa-trash" style="color:red;cursor:pointer;" onclick="${delAction}"></i></td></tr>`;
        });
        if(leaves.length === 0) tbody.innerHTML = "<tr><td colspan='3'>रिकॉर्ड नहीं</td></tr>";
    } 
    else {
        document.getElementById('sb-thead').innerHTML = `<tr><th rowspan="2">वर्ष</th><th rowspan="2">प्रारंभिक</th><th colspan="2">उपयोग</th><th rowspan="2">शेष</th><th rowspan="2">क्रेडिट</th><th rowspan="2">Closing</th></tr><tr><th>से - तक</th><th>कुल</th></tr>`;
        let startY = userProfile.appt ? new Date(userProfile.appt).getFullYear() : 2014;
        let endY = getMaxActiveYear(); 
        let runningBal = 0; 
        if(conf.format === 'FIXED_QUOTA' || conf.format === 'DECREMENTAL') runningBal = conf.quota;
        else if(conf.quota > 0) runningBal = conf.quota;

        for(let y = startY; y <= endY; y++) {
            let rowBase = { year: y, opening: runningBal, credit: 0, used: 0 };
            if(manualCredits[type] && manualCredits[type][y]) {
                let cred = manualCredits[type][y];
                rowBase.credit = cred; runningBal += cred; 
            }
            let leaves = leaveHistory.filter(l => l.type === type && l.date.startsWith(`${y}-`));
            
            if(leaves.length > 0) {
                 let ranges = getRanges(leaves);
                 ranges.forEach((rng, idx) => {
                     let debit = rng.count; runningBal -= debit;
                     let delAction = `deleteRange('${rng.dates.join(',')}')`;
                     let delBtn = `<i class="fas fa-trash" style="color:red;cursor:pointer;" onclick="${delAction}"></i>`;
                     tbody.innerHTML += `<tr><td>${y}</td><td>${idx===0 ? rowBase.opening : ''}</td><td style="font-size:0.7rem;">${getIndDate(rng.start)}<br>से ${getIndDate(rng.end)}</td><td>${debit}</td><td>-</td><td>${(idx===0 && rowBase.credit>0) ? '+'+rowBase.credit : '-'}</td><td><b>${runningBal}</b> ${delBtn}</td></tr>`;
                 });
            } else {
                if(rowBase.credit > 0 || y === endY) {
                     tbody.innerHTML += `<tr><td>${y}</td><td>${rowBase.opening}</td><td>-</td><td>-</td><td>${rowBase.opening}</td><td>${rowBase.credit>0 ? '+'+rowBase.credit : '-'}</td><td><b>${runningBal}</b></td></tr>`;
                }
            }
        }
    }
}

function getRanges(leaves) {
    if (leaves.length === 0) return [];
    let ranges = [];
    let start = new Date(leaves[0].date); let prev = start; let count = 1; let rawDates = [leaves[0].date];
    for (let i = 1; i < leaves.length; i++) {
        let curr = new Date(leaves[i].date); let diff = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diff === 1) { count++; prev = curr; rawDates.push(leaves[i].date); }
        else { ranges.push({ start: start.toISOString().split('T')[0], end: prev.toISOString().split('T')[0], count: count, dates: [...rawDates] }); start = curr; prev = curr; count = 1; rawDates = [leaves[i].date]; }
    }
    ranges.push({ start: start.toISOString().split('T')[0], end: prev.toISOString().split('T')[0], count: count, dates: [...rawDates] });
    return ranges;
}

// --- PROFILE UI ---
window.openProfileModal = function() {
    let modal = document.getElementById('profileModal');
    let content = modal.querySelector('.modal-content');
    
    let retDate = "";
    if(userProfile.dob) {
        let d = new Date(userProfile.dob);
        d.setFullYear(d.getFullYear() + 60);
        let lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        retDate = lastDay.toISOString().split('T')[0];
    }

    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;">
            <h3 style="color:#4e54c8; margin:0;">कर्मचारी प्रोफाइल</h3>
            <span class="close-btn" onclick="document.getElementById('profileModal').style.display='none'" style="font-size:1.5rem; cursor:pointer;">&times;</span>
        </div>
        
        <div style="margin-top:15px; max-height:70vh; overflow-y:auto; padding-right:5px;">
            <div class="form-group"><label class="input-label">कर्मचारी का नाम:</label><input type="text" id="prof-name" value="${userProfile.name||''}"></div>
            <div class="form-group"><label class="input-label">पिता का नाम:</label><input type="text" id="prof-father" value="${userProfile.father||''}"></div>
            <div class="form-group"><label class="input-label">जन्मतिथि (DOB):</label><input type="date" id="prof-dob" value="${userProfile.dob||''}"></div>
            <div class="form-group"><label class="input-label">मोबाइल नंबर:</label><input type="tel" id="prof-mobile" value="${userProfile.mobile||''}"></div>
            
            <div class="form-group highlight-box">
                <label class="input-label">नियुक्ति तिथि (Joining Date):</label>
                <input type="date" id="prof-appt" value="${userProfile.appt||''}">
            </div>

            <div class="form-group"><label class="input-label">सेवानिवृत्त तिथि (Retirement):</label><input type="date" id="prof-ret" value="${retDate}" disabled style="background:#eee;"></div>
            
            <div class="form-group"><label class="input-label">वर्तमान विद्यालय/कार्यालय:</label><input type="text" id="prof-school" value="${userProfile.school||''}"></div>
            <div class="form-group"><label class="input-label">कर्मचारी कोड (IFMS):</label><input type="text" id="prof-ifms" value="${userProfile.ifms||''}"></div>
            <div class="form-group"><label class="input-label">UDISE Code:</label><input type="text" id="prof-udise" value="${userProfile.udise||''}"></div>
            <div class="form-group"><label class="input-label">Portal ID:</label><input type="text" id="prof-portal" value="${userProfile.portal||''}"></div>
            
            <div class="form-group" style="background:#e3f2fd; padding:10px; border-radius:8px;">
                <label class="input-label">सुरक्षा PIN (4 अंक):</label>
                <input type="password" id="prof-pin" maxlength="4" value="${userProfile.pin||''}" placeholder="Ex: 1234">
            </div>

            <hr>
            <div class="form-group">
                <label class="input-label">पूर्व में की गई सेवाओं का विवरण जोड़ें?</label>
                <select id="prof-service-toggle" onchange="toggleServiceSection()" style="width:100%;">
                    <option value="NO">नहीं (NO)</option>
                    <option value="YES" ${userProfile.hasServiceHistory === 'YES' ? 'selected' : ''}>हाँ (YES)</option>
                </select>
            </div>

            <div id="service-history-container" style="display:${userProfile.hasServiceHistory === 'YES' ? 'block' : 'none'};">
                <div id="service-rows"></div>
                <button class="btn-save" style="background:#555; margin-top:10px; padding:8px;" onclick="addServiceRow()">+ Add More School</button>
            </div>
        </div>
        
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px;">
            <button class="btn-save dual-gradient-bg" onclick="saveProfile()">सेव करें</button>
            <button class="btn-reset" onclick="resetAllData()">RESET ALL DATA</button>
        </div>
    `;
    modal.style.display = 'block';
    
    let container = document.getElementById('service-rows');
    container.innerHTML = "";
    if(userProfile.serviceHistory && userProfile.serviceHistory.length > 0) {
        userProfile.serviceHistory.forEach(s => addServiceRow(s));
    } else {
        addServiceRow();
    }
}

window.toggleServiceSection = function() {
    let val = document.getElementById('prof-service-toggle').value;
    document.getElementById('service-history-container').style.display = (val === 'YES') ? 'block' : 'none';
}

window.addServiceRow = function(data = {school:'', from:'', to:''}) {
    let div = document.createElement('div');
    div.className = 'service-row';
    div.style = "background:#fafafa; border:1px solid #ddd; padding:10px; margin-bottom:10px; border-radius:5px;";
    div.innerHTML = `
        <label class="input-label">विद्यालय/कार्यालय का नाम:</label>
        <input type="text" class="srv-name" value="${data.school}" style="margin-bottom:5px;">
        <div style="display:flex; gap:5px;">
            <div style="flex:1;"><label style="font-size:0.7rem;">कब से:</label><input type="date" class="srv-from" value="${data.from}"></div>
            <div style="flex:1;"><label style="font-size:0.7rem;">कब तक:</label><input type="date" class="srv-to" value="${data.to}"></div>
        </div>
    `;
    document.getElementById('service-rows').appendChild(div);
}

window.saveProfile = function() {
    let history = [];
    if(document.getElementById('prof-service-toggle').value === 'YES') {
        document.querySelectorAll('.service-row').forEach(row => {
            let s = row.querySelector('.srv-name').value;
            let f = row.querySelector('.srv-from').value;
            let t = row.querySelector('.srv-to').value;
            if(s) history.push({school:s, from:f, to:t});
        });
    }

    userProfile = { 
        name: document.getElementById('prof-name').value, 
        father: document.getElementById('prof-father').value, 
        dob: document.getElementById('prof-dob').value, 
        mobile: document.getElementById('prof-mobile').value, 
        appt: document.getElementById('prof-appt').value, 
        school: document.getElementById('prof-school').value, 
        ifms: document.getElementById('prof-ifms').value, 
        udise: document.getElementById('prof-udise').value, 
        portal: document.getElementById('prof-portal').value, 
        desig: "Teacher", 
        pin: document.getElementById('prof-pin').value,
        hasServiceHistory: document.getElementById('prof-service-toggle').value,
        serviceHistory: history
    };
    saveData(); document.getElementById('profileModal').style.display='none'; refreshAll();
}

// --- PRATIKAR MANAGER ---
window.openPratikarModal = function() {
    let modal = document.getElementById('pratikarModal');
    let content = modal.querySelector('.modal-content');
    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px; margin-bottom:10px;">
            <h3 style="color:#4e54c8; margin:0;">प्रतिकर अवकाश (Compensatory)</h3>
            <span class="close-btn" onclick="document.getElementById('pratikarModal').style.display='none'" style="font-size:2rem; cursor:pointer;">&times;</span>
        </div>
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button id="btn-p-apply" class="action-tab active-tab" onclick="switchPratikarTab('apply')">अवकाश लें (Apply)</button>
            <button id="btn-p-earn" class="action-tab" onclick="switchPratikarTab('earn')">अवकाश जोड़ें (Earn)</button>
        </div>
        <div id="p-sec-apply">
            <label class="input-label">उपलब्ध प्रतिकर चुनें (Select Earned):</label>
            <select id="p-select-available" style="width:100%; padding:10px; border-radius:5px; margin-bottom:10px;"></select>
            <label class="input-label">अवकाश दिनांक (Leave Date):</label>
            <input type="date" id="p-apply-date" style="width:100%;">
            <button class="btn-save" style="margin-top:10px; background:#c0392b;" onclick="applyPratikarLeave()"><i class="fas fa-check"></i> उपभोग करें (Apply)</button>
            <h4 style="margin:15px 0 5px 0; font-size:0.9rem;">उपभोग इतिहास (Consumed History):</h4>
            <ul id="p-consumed-list" class="holiday-list-style" style="max-height:100px; overflow-y:auto; background:#fafafa; border:1px solid #eee; padding:5px;"></ul>
        </div>
        <div id="p-sec-earn" style="display:none;">
            <div style="background:#e8f5e9; padding:10px; border-radius:5px; border:1px solid #c8e6c9;">
                <label class="input-label">कार्य दिवस (Work Date):</label><input type="date" id="p-earn-date">
                <label class="input-label" style="margin-top:8px;">कारण (Reason):</label><input type="text" id="p-earn-reason" placeholder="जैसे: चुनाव ड्यूटी...">
                <button class="btn-save" style="background:#27ae60; margin-top:10px;" onclick="saveEarnedPratikar()"><i class="fas fa-plus"></i> प्रतिकर अवकाश जोड़े</button>
            </div>
            <h4 style="margin:15px 0 5px 0; font-size:0.9rem;">अर्जित इतिहास (Earned History):</h4>
            <ul id="p-earned-list" class="holiday-list-style" style="max-height:100px; overflow-y:auto; background:#fafafa; border:1px solid #eee; padding:5px;"></ul>
        </div>
        <div style="padding:10px; text-align:center; background:#fff0f0; border-top:1px solid #ffcdd2; margin-top:10px;">
            <button class="btn-reset" style="font-size:0.8rem; padding:8px 15px;" onclick="resetSpecificLeave('Pratikar')">
                <i class="fas fa-trash"></i> Reset Pratikar Data
            </button>
        </div>
    `;
    modal.style.display = 'block';
    renderPratikarUI();
}

window.switchPratikarTab = function(tab) {
    document.getElementById('btn-p-apply').classList.remove('active-tab');
    document.getElementById('btn-p-earn').classList.remove('active-tab');
    document.getElementById('p-sec-apply').style.display = 'none';
    document.getElementById('p-sec-earn').style.display = 'none';
    if(tab === 'apply') {
        document.getElementById('btn-p-apply').classList.add('active-tab');
        document.getElementById('p-sec-apply').style.display = 'block';
    } else {
        document.getElementById('btn-p-earn').classList.add('active-tab');
        document.getElementById('p-sec-earn').style.display = 'block';
    }
}

window.renderPratikarUI = function() {
    let select = document.getElementById('p-select-available');
    if(select) {
        select.innerHTML = '<option value="">-- चुनें --</option>';
        let availableCount = 0;
        earnedPratikar.forEach((p) => {
            if(p.status === 'Available') {
                select.innerHTML += `<option value="${p.id}">${getIndDate(p.date)} - ${p.reason}</option>`;
                availableCount++;
            }
        });
        if(availableCount === 0) select.innerHTML = '<option value="">कोई बैलेंस शेष नहीं</option>';
    }
    let earnList = document.getElementById('p-earned-list');
    if(earnList) {
        earnList.innerHTML = "";
        earnedPratikar.forEach((p, index) => {
            let statusColor = p.status === 'Available' ? 'green' : 'red';
            let delBtn = p.status === 'Available' ? `<i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="deleteEarnedPratikar(${index})"></i>` : '';
            earnList.innerHTML += `<li><span>${getIndDate(p.date)} (${p.reason}) - <b style="color:${statusColor}">${p.status}</b></span> ${delBtn}</li>`;
        });
    }
    let consumedList = document.getElementById('p-consumed-list');
    if(consumedList) {
        consumedList.innerHTML = "";
        let pLeaves = leaveHistory.filter(l => l.type === 'Pratikar');
        pLeaves.forEach(l => {
            let earnedRec = earnedPratikar.find(e => e.id == l.linkedEarnedId);
            let workInfo = earnedRec ? `(Work: ${getIndDate(earnedRec.date)})` : "(Old Record)";
            consumedList.innerHTML += `<li><span>Leave: <b>${getIndDate(l.date)}</b> <small>${workInfo}</small></span> <i class="fas fa-trash" style="color:red; cursor:pointer;" onclick="deleteConsumedPratikar('${l.date}')"></i></li>`;
        });
    }
}

window.saveEarnedPratikar = function() {
    let d = document.getElementById('p-earn-date').value;
    let r = document.getElementById('p-earn-reason').value;
    if(d) {
        earnedPratikar.push({id: Date.now(), date: d, reason: r, status: "Available"});
        saveData(); renderPratikarUI(); refreshAll(); alert("जुड़ गया!");
        document.getElementById('p-earn-reason').value = "";
    } else alert("दिनांक चुनें");
}

window.deleteEarnedPratikar = function(index) {
    verifyAndExecute("क्या आप इस अर्जित अवकाश को डिलीट करना चाहते हैं?", () => {
        earnedPratikar.splice(index, 1); saveData(); renderPratikarUI(); refreshAll();
    });
}

window.applyPratikarLeave = function() {
    let earnedId = document.getElementById('p-select-available').value;
    let leaveDate = document.getElementById('p-apply-date').value;
    if(!earnedId) return alert("अर्जित अवकाश चुनें।");
    if(!leaveDate) return alert("अवकाश की तारीख चुनें।");
    if(isHolidayOrSunday(new Date(leaveDate))) return alert("छुट्टी/रविवार को नहीं ले सकते।");
    if(leaveHistory.some(x => x.date === leaveDate)) return alert("पहले से दर्ज है।");

    let earnedIdx = earnedPratikar.findIndex(p => p.id == earnedId);
    if(earnedIdx > -1) {
        earnedPratikar[earnedIdx].status = "Consumed";
        earnedPratikar[earnedIdx].consumedDate = leaveDate;
    }
    leaveHistory.push({ date: leaveDate, type: 'Pratikar', linkedEarnedId: earnedId });
    saveData(); renderPratikarUI(); refreshAll(); alert("दर्ज हो गया!");
}

window.deleteConsumedPratikar = function(leaveDate) {
    verifyAndExecute("रद्द करें? संबंधित कार्य दिवस वापस Available हो जाएगा।", () => {
        let leaveIdx = leaveHistory.findIndex(l => l.date === leaveDate && l.type === 'Pratikar');
        if(leaveIdx > -1) {
            let linkedId = leaveHistory[leaveIdx].linkedEarnedId;
            let earnedIdx = earnedPratikar.findIndex(p => p.id == linkedId);
            if(earnedIdx > -1) {
                earnedPratikar[earnedIdx].status = "Available";
                delete earnedPratikar[earnedIdx].consumedDate;
            }
            leaveHistory.splice(leaveIdx, 1);
            saveData(); renderPratikarUI(); refreshAll();
        }
    });
}

// --- ACTIONS ---
window.submitLeaveEntry = function() {
    let s = document.getElementById('action-start').value;
    let e = document.getElementById('action-end').value;
    if(!s || !e) return alert("तारीख चुनें");
    let curr = new Date(s), end = new Date(e);
    let addedCount = 0;
    let conf = leaveConfig[currentLeaveType];
    while(curr <= end) {
        let fDate = curr.toISOString().split('T')[0];
        let canAdd = true;
        if(conf.excludeHolidays && isHolidayOrSunday(curr)) canAdd = false; 
        if(canAdd && !leaveHistory.some(x => x.date === fDate)) {
            leaveHistory.push({ date: fDate, type: currentLeaveType });
            addedCount++;
        }
        curr.setDate(curr.getDate() + 1);
    }
    if(addedCount > 0) { saveData(); renderModalTable(currentLeaveType); alert(`${addedCount} दिन का अवकाश दर्ज हुआ।`); } 
    else alert("छुट्टियां थीं या पहले से दर्ज था।");
}

window.submitCreditEntry = function() {
    let val = parseInt(document.getElementById('action-val').value);
    if(!val) return alert("संख्या लिखें");
    if(!manualCredits[currentLeaveType]) manualCredits[currentLeaveType] = {};
    let year;
    if(leaveConfig[currentLeaveType].format === 'FIXED_QUOTA') {
        year = userProfile.appt ? new Date(userProfile.appt).getFullYear() : 2014;
    } else {
        year = document.getElementById('action-year').value;
    }
    manualCredits[currentLeaveType][year] = val; 
    saveData(); renderModalTable(currentLeaveType); alert("अपडेट हो गया!");
    document.getElementById('action-val').value = "";
}

// --- UTILS ---
window.deleteLeave = function(d) { 
    verifyAndExecute("हटाएं?", () => {
        leaveHistory = leaveHistory.filter(l => l.date !== d); 
        saveData(); renderModalTable(currentLeaveType); refreshAll(); 
    });
}

window.deleteRange = function(dStr) { 
    verifyAndExecute("हटाएं?", () => {
        let dates = dStr.split(','); 
        leaveHistory = leaveHistory.filter(l => !dates.includes(l.date)); 
        saveData(); renderModalTable(currentLeaveType); refreshAll(); 
    });
}

window.switchTab = function(id) {
    document.querySelectorAll('.app-view').forEach(d => d.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
    let map = {'view-calendar':0, 'view-manager':1, 'view-dob':2, 'view-notes':3};
    let btns = document.querySelectorAll('.nav-btn');
    if(btns[map[id]]) btns[map[id]].classList.add('active-nav');
    let holDropdown = document.querySelector('.holiday-dropdown');
    if(holDropdown) { if(id === 'view-calendar') holDropdown.style.display = 'block'; else holDropdown.style.display = 'none'; }
}

window.calculateAge = function() {
    let dob = document.getElementById('dob-input').value;
    let target = document.getElementById('dob-target').value;
    if(!dob) return;
    if(!target) target = new Date().toISOString().split('T')[0];
    let d1 = new Date(dob), d2 = new Date(target);
    let y = d2.getFullYear() - d1.getFullYear(), m = d2.getMonth() - d1.getMonth(), d = d2.getDate() - d1.getDate();
    if(d < 0) { m--; d += new Date(d2.getFullYear(), d2.getMonth(), 0).getDate(); }
    if(m < 0) { y--; m += 12; }
    document.getElementById('age-text').innerText = `${y} वर्ष, ${m} माह, ${d} दिन`;
}

window.renderNotes = function() {
    const list = document.getElementById('notes-list');
    if(!list) return;
    list.innerHTML = "";
    myNotes.forEach((n, i) => { list.innerHTML += `<div style="background:#fff; padding:10px; margin-bottom:5px; border:1px solid #ddd; border-radius:5px;"><b>${n.title}</b><p>${n.text}</p><i class="fas fa-trash" style="float:right; color:red; cursor:pointer;" onclick="deleteNote(${i})"></i></div>`; });
}

window.addNote = function() {
    let t = document.getElementById('note-title').value, txt = document.getElementById('note-text').value;
    if(t||txt) { myNotes.push({title:t, text:txt, date: new Date().toISOString()}); saveData(); renderNotes(); document.getElementById('note-title').value=""; document.getElementById('note-text').value=""; }
}

window.deleteNote = function(i) { verifyAndExecute("नोट डिलीट करें?", () => { myNotes.splice(i,1); saveData(); renderNotes(); }); }

window.resetData = function() { resetAllData(); }

window.setSection = function(s) { 
    let sl = document.getElementById('leave-type'); 
    if(!sl) return;
    sl.innerHTML = "";
    Object.keys(leaveConfig).forEach(k => {
        let conf = leaveConfig[k];
        if(s === 'short' && conf.type === 'SHORT') sl.innerHTML += `<option value="${k}">${conf.name}</option>`;
        if(s === 'long' && conf.type === 'LONG') sl.innerHTML += `<option value="${k}">${conf.name}</option>`;
    });
    document.querySelectorAll('.sec-btn').forEach(b => b.classList.remove('active-sec'));
    let activeBtn = document.querySelector(s==='short' ? '.short-btn' : '.long-btn');
    if(activeBtn) activeBtn.classList.add('active-sec');
}

window.checkInputVisibility = function() {
    let t = document.getElementById('leave-type').value;
    let pBox = document.getElementById('pratikar-select-box');
    if(pBox) pBox.style.display = (t === 'Pratikar') ? 'block' : 'none';
}

window.addLeave = function() {
    let type = document.getElementById('leave-type').value;
    if(!type) return alert("Select Leave");
    currentLeaveType = type;
    window.submitLeaveEntry(); 
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    populateCalendarDropdowns();
    switchTab('view-calendar');
    let tX=0; const sw=document.getElementById('calendar-swipe-area');
    if(sw){ sw.addEventListener('touchstart',e=>tX=e.changedTouches[0].screenX,{passive:true}); sw.addEventListener('touchend',e=>{ if(e.changedTouches[0].screenX<tX-50)changeMonth(1); if(e.changedTouches[0].screenX>tX+50)changeMonth(-1); },{passive:true}); }
});
