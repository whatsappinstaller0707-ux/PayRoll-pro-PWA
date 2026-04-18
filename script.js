// --- STATE MANAGEMENT ---
let rates = JSON.parse(localStorage.getItem('payrollRates')) || {
    Manager: 10000,
    Supervisor: 7000,
    Worker: 5000
};

let entries = JSON.parse(localStorage.getItem('payrollEntries')) || [];

let formulaConfig = JSON.parse(localStorage.getItem('formulaConfig')) || {
    days: { label: "Days Worked", type: "multiplier", active: true },
    welfare: { label: "Social Welfare", type: "deduction", active: true },
    loan: { label: "Loan", type: "deduction", active: true },
    ration: { label: "Ration", type: "deduction", active: true }
};

// --- CORE APP ENGINE ---
function init() {
    loadRanks();
    renderDynamicInputs();
    renderFormulaEditor();
    updateEntryCount();
    loadBizProfile();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active');
    
    if(id === 'rateScreen') renderRateList();
    if(id === 'historyScreen') renderHistory();
}

function renderDynamicInputs() {
    const container = document.getElementById('dynamicInputs');
    if(!container) return;
    container.innerHTML = `
        <label style="font-size:11px; opacity:0.7; font-weight:bold; display:block; margin-top:10px">DAILY RATE (MWK)</label>
        <input type="number" id="currentRate" placeholder="Daily Rate" oninput="calc()">
    `;

    for (let key in formulaConfig) {
        if (formulaConfig[key].active) {
            container.innerHTML += `
                <label style="font-size:11px; opacity:0.7; font-weight:bold; display:block; margin-top:10px">${formulaConfig[key].label.toUpperCase()}</label>
                <input type="number" id="input_${key}" placeholder="${formulaConfig[key].label}" oninput="calc()">
            `;
        }
    }
}

function loadRanks() {
    const select = document.getElementById('empRank');
    if(!select) return;
    select.innerHTML = '<option value="">Select Rank</option>';
    for (let r in rates) {
        select.innerHTML += `<option value="${r}">${r}</option>`;
    }
}

function updateRateInput() {
    const rank = document.getElementById('empRank').value;
    const rateInput = document.getElementById('currentRate');
    if(rateInput) rateInput.value = rates[rank] || 0;
    calc();
}

function calc() {
    const rateEl = document.getElementById('currentRate');
    const dailyRate = rateEl ? (Number(rateEl.value) || 0) : 0;
    
    let earnings = 0;
    let deductions = 0;
    let vals = {};

    for (let key in formulaConfig) {
        const el = document.getElementById(`input_${key}`);
        const val = el ? (Number(el.value) || 0) : 0;
        vals[key] = val;

        if (formulaConfig[key].active) {
            if (formulaConfig[key].type === "multiplier") {
                earnings += val * dailyRate;
            } else if (formulaConfig[key].type === "deduction") {
                deductions += val;
            }
        }
    }

    const gross = earnings;
    const net = gross - deductions;

    document.getElementById('grossDisp').innerText = gross.toLocaleString() + " MWK";
    document.getElementById('netDisp').innerText = net.toLocaleString() + " MWK";

    return { gross, net, vals, dailyRate };
}

// --- ACTIONS ---
function saveEntry() {
    const name = document.getElementById('empName').value;
    const rank = document.getElementById('empRank').value;
    if (!name || !rank) return alert("Fill Name and Rank");

    const { gross, net, vals, dailyRate } = calc();
    const entry = {
        Date: new Date().toLocaleDateString(),
        Name: name,
        Rank: rank,
        DailyRate: dailyRate,
        Gross: gross,
        Net: net,
        ...vals 
    };

    entries.push(entry);
    localStorage.setItem('payrollEntries', JSON.stringify(entries));
    updateEntryCount();
    resetForm();
    alert("Saved Successfully!");
}

function resetForm() {
    document.getElementById('empName').value = "";
    document.getElementById('empRank').value = "";
    renderDynamicInputs(); 
    document.getElementById('grossDisp').innerText = "0 MWK";
    document.getElementById('netDisp').innerText = "0 MWK";
}

function updateEntryCount() {
    const el = document.getElementById('count');
    if(el) el.innerText = entries.length;
}

// --- LOGO UPLOAD LOGIC ---
function uploadLogo(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Image = e.target.result;
            localStorage.setItem('payrollLogoUrl', base64Image);
            updateBizProfile();
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// --- EXPORT TO EXCEL (GOSHEN STYLE) ---
function exportToExcel() {
    if(!entries.length) return alert("No history to export.");

    const bizName = localStorage.getItem('payrollBizName') || "Jay Tech Inc";
    const reportDate = new Date().toLocaleDateString();

    const grouped = {};
    entries.forEach(e => {
        if (!grouped[e.Rank]) grouped[e.Rank] = [];
        grouped[e.Rank].push(e);
    });

    const exportData = [];
    exportData.push({ "B": bizName.toUpperCase() });
    exportData.push({ "B": "PAYROLL REPORT: " + reportDate });
    exportData.push({}); 

    const headers = {
        "A": "NO", "B": "NAME", "C": "RATE", "D": "DAYS", "E": "GROSS", 
        "F": "WELFARE", "G": "LOAN", "H": "RATION", "I": "NET"
    };
    exportData.push(headers);

    let globalCounter = 1;
    let grandTotal = 0;

    for (let rank in grouped) {
        exportData.push({ "B": "--- " + rank.toUpperCase() + " ---" });
        
        let rankGross = 0;
        let rankNet = 0;

        grouped[rank].forEach(e => {
            exportData.push({
                "A": globalCounter++,
                "B": e.Name,
                "C": e.DailyRate,
                "D": e.days || 0,
                "E": e.Gross,
                "F": e.welfare || 0,
                "G": e.loan || 0,
                "H": e.ration || 0,
                "I": e.Net
            });
            rankGross += e.Gross;
            rankNet += e.Net;
        });

        exportData.push({ "B": "TOTAL FOR " + rank, "E": rankGross, "I": rankNet });
        exportData.push({}); 
        grandTotal += rankNet;
    }

    exportData.push({ "B": "GRAND TOTAL PAYOUT", "I": grandTotal });

    const ws = XLSX.utils.json_to_sheet(exportData, { skipHeader: true });
    ws['!cols'] = [
        { wch: 6 }, { wch: 28 }, { wch: 12 }, { wch: 8 }, 
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PaySheet");
    XLSX.writeFile(wb, `${bizName}_Payroll_${reportDate.replace(/\//g, '-')}.xlsx`);
}

// --- SETTINGS & PROFILE ---
function renderFormulaEditor() {
    const container = document.getElementById('formulaToggles');
    if(!container) return;
    container.innerHTML = "";
    for (let key in formulaConfig) {
        const conf = formulaConfig[key];
        container.innerHTML += `
            <div class="toggle-row">
                <div style="flex:1">
                    <strong>${conf.label}</strong><br>
                    <small>${conf.type === 'multiplier' ? 'Adds to Gross' : 'Subtracts from Gross'}</small>
                </div>
                <input type="checkbox" ${conf.active ? 'checked' : ''} onchange="toggleFormulaField('${key}')">
            </div>
        `;
    }
}

function toggleFormulaField(key) {
    formulaConfig[key].active = !formulaConfig[key].active;
    localStorage.setItem('formulaConfig', JSON.stringify(formulaConfig));
    renderDynamicInputs();
}

function renderRateList() {
    const list = document.getElementById('ratesEditorList');
    if(!list) return;
    list.innerHTML = "";
    for (let r in rates) {
        list.innerHTML += `
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:5px">
                <span style="flex:2">${r}</span>
                <input style="flex:1; margin:0" type="number" value="${rates[r]}" onchange="updateRate('${r}', this.value)">
                <button onclick="deleteRank('${r}')" style="width:auto; margin:0; padding:5px; background:none; color:red; border:none;">✕</button>
            </div>
        `;
    }
}

function updateRate(r, val) {
    rates[r] = Number(val);
    localStorage.setItem('payrollRates', JSON.stringify(rates));
}

function addRank() {
    const n = document.getElementById('newRankName').value;
    const r = document.getElementById('newRankRate').value;
    if(!n || !r) return;
    rates[n] = Number(r);
    localStorage.setItem('payrollRates', JSON.stringify(rates));
    document.getElementById('newRankName').value = "";
    document.getElementById('newRankRate').value = "";
    renderRateList();
    loadRanks();
}

function deleteRank(r) {
    if(confirm("Delete " + r + "?")) {
        delete rates[r];
        localStorage.setItem('payrollRates', JSON.stringify(rates));
        renderRateList();
        loadRanks();
    }
}

function renderHistory() {
    const list = document.getElementById('historyList');
    const totalDisp = document.getElementById('totalHistoryNet');
    if(!list) return;

    list.innerHTML = entries.length ? "" : "<p style='text-align:center; opacity:0.5'>No history.</p>";
    
    const totalPayout = entries.reduce((sum, e) => sum + e.Net, 0);
    if(totalDisp) totalDisp.innerText = totalPayout.toLocaleString();

    [...entries].reverse().forEach((e, index) => {
        const actualIndex = entries.length - 1 - index;
        list.innerHTML += `
            <div class="history-card">
                <div style="display:flex; justify-content:space-between">
                    <strong>${e.Name}</strong>
                    <button onclick="deleteEntry(${actualIndex})" style="width:auto; padding:5px; color:red; background:none; border:none;">✕</button>
                </div>
                <small>${e.Rank} | ${e.Date}</small>
                <div style="margin-top:8px; font-weight:bold; color:var(--primary)">Net: ${e.Net.toLocaleString()} MWK</div>
            </div>
        `;
    });
}

function deleteEntry(i) {
    if(confirm("Delete entry?")) {
        entries.splice(i, 1);
        localStorage.setItem('payrollEntries', JSON.stringify(entries));
        updateEntryCount();
        renderHistory();
    }
}

function clearAllData() {
    if(confirm("DANGER: Delete ALL entries?")) {
        entries = [];
        localStorage.removeItem('payrollEntries');
        updateEntryCount();
        renderHistory();
    }
}

function updateBizProfile() {
    const name = document.getElementById('bizNameInput').value;
    const logoBase64 = localStorage.getItem('payrollLogoUrl');
    
    document.getElementById('displayBizName').innerText = name || "My Business";
    
    const iconDiv = document.getElementById('profileIcon');
    const navIcon = document.querySelector('.nav-icon');

    let content = logoBase64 ? `<img src="${logoBase64}" class="logo-img">` : 
                  (name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || "JS");

    if(iconDiv) iconDiv.innerHTML = content;
    if(navIcon) navIcon.innerHTML = content;

    localStorage.setItem('payrollBizName', name);
}

function changeTheme(themeClass) {
    document.body.className = themeClass;
    localStorage.setItem('payrollTheme', themeClass);
}

function loadBizProfile() {
    const name = localStorage.getItem('payrollBizName') || "";
    const theme = localStorage.getItem('payrollTheme') || "theme-blue";

    if(document.getElementById('bizNameInput')) document.getElementById('bizNameInput').value = name;
    if(document.getElementById('themeSelect')) document.getElementById('themeSelect').value = theme;
    
    changeTheme(theme);
    updateBizProfile();
}

window.onload = init;
