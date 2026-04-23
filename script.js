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

    const gDisp = document.getElementById('grossDisp');
    const nDisp = document.getElementById('netDisp');
    if(gDisp) gDisp.innerText = gross.toLocaleString() + " MWK";
    if(nDisp) nDisp.innerText = net.toLocaleString() + " MWK";

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
    const nameInput = document.getElementById('empName');
    const rankSelect = document.getElementById('empRank');
    if(nameInput) nameInput.value = "";
    if(rankSelect) rankSelect.value = "";
    renderDynamicInputs(); 
    const gDisp = document.getElementById('grossDisp');
    const nDisp = document.getElementById('netDisp');
    if(gDisp) gDisp.innerText = "0 MWK";
    if(nDisp) nDisp.innerText = "0 MWK";
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
async function loadTemplate(templateName) {
    const response = await fetch(`templates/${templateName}`);
    
    if (!response.ok) {
        throw new Error("Template not found: " + templateName);
    }
    
    return await response.arrayBuffer();
}
async function exportToExcel(company, month, title) {
    if (!entries.length) return alert("No data");
    
    try {
        const templateFile = "template.xlsx";
        const buffer = await loadTemplate(templateFile);
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        
        const worksheet = workbook.worksheets[0];
        
        // ✅ COLUMN COUNT (MATCH YOUR TEMPLATE EXACTLY)
        const totalColumns = 7; // No, Name, Days, Gross, Welfare, Loan, Ration, Net → adjust if needed
        
        // ✅ TITLE (ROW 1)
        worksheet.getCell("A1").value = title;
        
        worksheet.getCell("A1").alignment = { horizontal: "center" };
        worksheet.getCell("A1").font = { bold: true, size: 14 };
        
        // ✅ COMPANY + MONTH (ROW 3)
        worksheet.getCell("A3").value = `${company} - End month of ${month}`;
        worksheet.getCell("A3").alignment = { horizontal: "left" };
        worksheet.getCell("A3").font = { bold: true };
        
        // ✅ DATA STARTS (ROW 5 because headers are row 4)
        let currentRow = 5;
        
        let totals = { gross: 0, net: 0 };
        
        let deductionTotals = {
            welfare: 0,
            loan: 0,
            ration: 0
        };
        
        // ✅ WRITE DATA
        entries.forEach((e, i) => {
            const row = worksheet.getRow(currentRow);
            let col = 1;
            
            row.getCell(col++).value = i + 1;
            row.getCell(col++).value = e.Name;
            
            if (formulaConfig.days?.active) {
                row.getCell(col++).value = e.days || 0;
            }
            
            row.getCell(col++).value = e.Gross || 0;
            
            if (formulaConfig.welfare?.active) {
                const val = e.welfare || 0;
                row.getCell(col++).value = val;
                deductionTotals.welfare += val;
            }
            
            if (formulaConfig.loan?.active) {
                const val = e.loan || 0;
                row.getCell(col++).value = val;
                deductionTotals.loan += val;
            }
            
            if (formulaConfig.ration?.active) {
                const val = e.ration || 0;
                row.getCell(col++).value = val;
                deductionTotals.ration += val;
            }
            
            row.getCell(col++).value = e.Net || 0;
            
            totals.gross += e.Gross || 0;
            totals.net += e.Net || 0;
            
            row.commit();
            currentRow++;
        });

        // ✅ DOWNLOAD
        const outBuffer = await workbook.xlsx.writeBuffer();
        
        const blob = new Blob([outBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        
        a.href = url;
        a.download = "Payroll_Output.xlsx";
        a.click();
        
        URL.revokeObjectURL(url);
        
    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    }
}
// --- SETTINGS & PROFILE ---
function renderFormulaEditor() {
    const container = document.getElementById('formulaToggles');
    if(!container) return;
    container.innerHTML = "";
    for (let key in formulaConfig) {
        const conf = formulaConfig[key];
        container.innerHTML += `
            <div class="toggle-row" style="display:flex; align-items:center; margin-bottom:10px">
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
    const nameInput = document.getElementById('bizNameInput');
    const name = nameInput ? nameInput.value : (localStorage.getItem('payrollBizName') || "My Business");
    const logoBase64 = localStorage.getItem('payrollLogoUrl');
    
    const displayTitle = document.getElementById('displayBizName');
    if(displayTitle) displayTitle.innerText = name || "My Business";
    
    const iconDiv = document.getElementById('profileIcon');
    const navIcon = document.querySelector('.nav-icon');

    let content = logoBase64 ? `<img src="${logoBase64}" class="logo-img" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : 
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

    const nameInput = document.getElementById('bizNameInput');
    const themeSelect = document.getElementById('themeSelect');

    if(nameInput) nameInput.value = name;
    if(themeSelect) themeSelect.value = theme;
    
    changeTheme(theme);
    updateBizProfile();
}

// --- INITIALIZATION ---
window.onload = init;

// --- SERVICE WORKER REGISTRATION (NEW) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
          .then(reg => console.log("Service Worker Registered", reg))
          .catch(err => console.log("Service Worker Failed", err));
    });
}
function openExportModal() {
    document.getElementById('exportModal').style.display = "flex";
}

function closeExportModal() {
    document.getElementById('exportModal').style.display = "none";
}

function confirmExport() {
    const company = document.getElementById('exportCompany').value;
    const month = document.getElementById('exportMonth').value;
    const title = document.getElementById('exportTitle').value || "Monthly payments arrangement";
    
    if (!company || !month) {
        alert("Fill all fields");
        return;
    }
    
    closeExportModal();
    exportToExcel(company, month, title);
}
