import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, writeBatch } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBaeTcv0ZkMLQ2vUVuAmz5kuYDbC1ztEIE",
    authDomain: "olkjoi.firebaseapp.com",
    projectId: "olkjoi",
    storageBucket: "olkjoi.firebasestorage.app",
    messagingSenderId: "483254024291",
    appId: "1:483254024291:web:f7be44be97410ad3fae056"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let materials = [];
let customers = [];
let syncQueue = [];

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwaInstallPrompt').style.display = 'flex';
});

window.installPWA = function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            document.getElementById('pwaInstallPrompt').style.display = 'none';
        });
    }
};

window.skipPWA = function() {
    document.getElementById('pwaInstallPrompt').style.display = 'none';
};

function updateConnectionStatus(status) {
    const statusDiv = document.getElementById('sync-status');
    statusDiv.className = `status-${status}`;
    statusDiv.innerText = status;
}

window.addEventListener('online', syncDataMerge);
window.addEventListener('offline', () => updateConnectionStatus('offline'));

async function loadLocalData() {
    let m = await localforage.getItem('materials');
    let c = await localforage.getItem('customers');
    let sq = await localforage.getItem('syncQueue');
    
    if (m) materials = m;
    if (c) customers = c;
    if (sq) syncQueue = sq;

    if (navigator.onLine) {
        syncDataMerge();
    } else {
        updateConnectionStatus('offline');
        renderMaterials();
        renderCustomers();
    }
}

async function saveLocalData() {
    await localforage.setItem('materials', materials);
    await localforage.setItem('customers', customers);
}

async function addToSyncQueue(action) {
    syncQueue.push(action);
    await localforage.setItem('syncQueue', syncQueue);
    if (navigator.onLine) {
        syncDataMerge();
    }
}

async function syncDataMerge() {
    updateConnectionStatus('syncing');
    try {
        const materialsSnapshot = await getDocs(collection(db, "materials"));
        let serverMaterials = [];
        materialsSnapshot.forEach((d) => { serverMaterials.push(d.data()); });

        const customersSnapshot = await getDocs(collection(db, "customers"));
        let serverCustomers = [];
        customersSnapshot.forEach((d) => { serverCustomers.push(d.data()); });

        let mergedMaterials = [...serverMaterials];
        materials.forEach(localMat => {
            let index = mergedMaterials.findIndex(sm => sm.id === localMat.id);
            if (index > -1) mergedMaterials[index] = localMat;
            else mergedMaterials.push(localMat);
        });

        let mergedCustomers = [...serverCustomers];
        customers.forEach(localCus => {
            let index = mergedCustomers.findIndex(sc => sc.id === localCus.id);
            if (index > -1) mergedCustomers[index] = localCus;
            else mergedCustomers.push(localCus);
        });

        let deletedMaterialIds = syncQueue.filter(q => q.type === 'DELETE_MATERIAL').map(q => q.data.id);
        let deletedCustomerIds = syncQueue.filter(q => q.type === 'DELETE_CUSTOMER').map(q => q.data.id);

        mergedMaterials = mergedMaterials.filter(m => !deletedMaterialIds.includes(m.id));
        mergedCustomers = mergedCustomers.filter(c => !deletedCustomerIds.includes(c.id));

        const batch = writeBatch(db);
        
        mergedMaterials.forEach(m => {
            let docRef = doc(db, "materials", m.id.toString());
            batch.set(docRef, m, { merge: true });
        });
        deletedMaterialIds.forEach(id => {
            let docRef = doc(db, "materials", id.toString());
            batch.delete(docRef);
        });

        mergedCustomers.forEach(c => {
            let docRef = doc(db, "customers", c.id.toString());
            batch.set(docRef, c, { merge: true });
        });
        deletedCustomerIds.forEach(id => {
            let docRef = doc(db, "customers", id.toString());
            batch.delete(docRef);
        });

        await batch.commit();

        syncQueue = [];
        await localforage.setItem('syncQueue', syncQueue);

        materials = mergedMaterials;
        customers = mergedCustomers;
        await saveLocalData();
        
        renderMaterials();
        renderCustomers();
        updateConnectionStatus('online');
    } catch (error) {
        console.error(error);
        updateConnectionStatus('offline');
    }
}

function showModal({ type, message, defaultValue = '', extraData = null }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        const modalText = document.getElementById('modalText');
        const modalInput = document.getElementById('modalInput');
        const modalButtons = document.getElementById('modalButtons');

        modalText.innerHTML = typeof message === 'string' ? message : (message.title || '');
        modalButtons.innerHTML = '';
        modalInput.style.display = 'none';
        modalInput.value = defaultValue;
        modalInput.type = 'text';

        const closeAction = (val) => {
            modal.classList.remove('active');
            setTimeout(() => { 
                const existingForm = document.getElementById('modalForm');
                if(existingForm) existingForm.remove();
                resolve(val); 
            }, 300);
        };

        if (type === 'alert') {
            const btn = document.createElement('button');
            btn.className = 'btn-modal btn-modal-confirm';
            btn.innerHTML = '<i class="fas fa-check"></i> موافق (Enter)';
            btn.onclick = () => closeAction(true);
            modalButtons.appendChild(btn);

            window.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Enter' && modal.classList.contains('active')) {
                    window.removeEventListener('keydown', onKey);
                    btn.click();
                }
            });
        } 
        else if (type === 'alert_with_print_receipt') {
            const btnOk = document.createElement('button');
            btnOk.className = 'btn-modal btn-modal-confirm';
            btnOk.innerHTML = '<i class="fas fa-check"></i> موافق (Enter)';
            btnOk.onclick = () => closeAction(true);

            const btnPrint = document.createElement('button');
            btnPrint.className = 'btn-modal btn-primary';
            btnPrint.style.background = '#10b981';
            btnPrint.innerHTML = '<i class="fas fa-print"></i> طباعة الوصل';
            btnPrint.onclick = () => {
                printReceipt(extraData.customerName, extraData.amount, extraData.date, extraData.notes, extraData.remainingDebt);
            };

            modalButtons.appendChild(btnOk);
            modalButtons.appendChild(btnPrint);

            window.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Enter' && modal.classList.contains('active')) {
                    window.removeEventListener('keydown', onKey);
                    btnOk.click();
                }
            });
        }
        else if (type === 'alert_with_print_statement') {
            const btnOk = document.createElement('button');
            btnOk.className = 'btn-modal btn-modal-confirm';
            btnOk.innerHTML = '<i class="fas fa-times"></i> إغلاق';
            btnOk.onclick = () => closeAction(true);

            const btnPrint = document.createElement('button');
            btnPrint.className = 'btn-modal btn-primary';
            btnPrint.style.background = '#10b981';
            btnPrint.innerHTML = '<i class="fas fa-print"></i> طباعة الكشف';
            btnPrint.onclick = () => {
                let c = customers.find(c => c.id === extraData.customerId);
                printStatement(c);
            };

            modalButtons.appendChild(btnOk);
            modalButtons.appendChild(btnPrint);
        }
        else if (type === 'confirm') {
            const btnYes = document.createElement('button');
            btnYes.className = 'btn-modal btn-modal-confirm';
            btnYes.innerHTML = '<i class="fas fa-check"></i> موافق (Enter)';
            btnYes.onclick = () => closeAction(true);

            const btnNo = document.createElement('button');
            btnNo.className = 'btn-modal btn-modal-cancel';
            btnNo.innerHTML = '<i class="fas fa-times"></i> إلغاء';
            btnNo.onclick = () => closeAction(false);

            modalButtons.appendChild(btnYes);
            modalButtons.appendChild(btnNo);

            window.addEventListener('keydown', function onKey(e) {
                if (e.key === 'Enter' && modal.classList.contains('active')) {
                    window.removeEventListener('keydown', onKey);
                    btnYes.click();
                }
            });
        } 
        else if (type === 'prompt') {
            modalInput.style.display = 'block';
            
            const btnYes = document.createElement('button');
            btnYes.className = 'btn-modal btn-modal-confirm';
            btnYes.innerHTML = '<i class="fas fa-save"></i> حفظ (Enter)';
            btnYes.onclick = () => closeAction(modalInput.value);

            const btnNo = document.createElement('button');
            btnNo.className = 'btn-modal btn-modal-cancel';
            btnNo.innerHTML = '<i class="fas fa-times"></i> إلغاء';
            btnNo.onclick = () => closeAction(null);

            modalButtons.appendChild(btnYes);
            modalButtons.appendChild(btnNo);

            modalInput.onkeydown = function(e) {
                if (e.key === 'Enter') btnYes.click();
            };

            setTimeout(() => modalInput.focus(), 300);
        }
        else if (type === 'password_prompt') {
            modalInput.style.display = 'block';
            modalInput.type = 'password';
            
            const btnYes = document.createElement('button');
            btnYes.className = 'btn-modal btn-modal-confirm';
            btnYes.innerHTML = '<i class="fas fa-unlock"></i> تأكيد (Enter)';
            btnYes.onclick = () => closeAction(modalInput.value);

            const btnNo = document.createElement('button');
            btnNo.className = 'btn-modal btn-modal-cancel';
            btnNo.innerHTML = '<i class="fas fa-times"></i> إلغاء';
            btnNo.onclick = () => closeAction(null);

            modalButtons.appendChild(btnYes);
            modalButtons.appendChild(btnNo);

            modalInput.onkeydown = function(e) {
                if (e.key === 'Enter') btnYes.click();
            };

            setTimeout(() => modalInput.focus(), 300);
        }
        else if (type === 'form') {
            const formContainer = document.createElement('div');
            formContainer.id = 'modalForm';
            
            message.fields.forEach(f => {
                if (f.type === 'select') {
                    let optionsHtml = f.options.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
                    formContainer.innerHTML += `
                        <div class="modal-form-group">
                            <label>${f.label}</label>
                            <select id="${f.id}">${optionsHtml}</select>
                        </div>
                    `;
                } else {
                    formContainer.innerHTML += `
                        <div class="modal-form-group">
                            <label>${f.label}</label>
                            <input type="${f.type || 'text'}" id="${f.id}" ${f.readonly ? 'readonly' : ''} value="${f.value || ''}">
                        </div>
                    `;
                }
            });

            modalText.innerHTML = message.title;
            modalText.after(formContainer);

            const btnYes = document.createElement('button');
            btnYes.className = 'btn-modal btn-modal-confirm';
            btnYes.innerHTML = '<i class="fas fa-save"></i> حفظ (Enter)';
            btnYes.onclick = () => {
                let results = {};
                message.fields.forEach(f => { results[f.id] = document.getElementById(f.id).value; });
                closeAction(results);
            };

            const btnNo = document.createElement('button');
            btnNo.className = 'btn-modal btn-modal-cancel';
            btnNo.innerHTML = '<i class="fas fa-times"></i> إلغاء';
            btnNo.onclick = () => closeAction(null);

            modalButtons.appendChild(btnYes);
            modalButtons.appendChild(btnNo);

            formContainer.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') btnYes.click();
            });

            setTimeout(() => {
                let firstInput = document.getElementById(message.fields[0].id);
                if(firstInput && !firstInput.readOnly) firstInput.focus();
            }, 300);
        }

        modal.classList.add('active');
    });
}

async function customAlert(msg) { return await showModal({ type: 'alert', message: msg }); }
async function customConfirm(msg) { return await showModal({ type: 'confirm', message: msg }); }
async function customPrompt(msg, def = '') { return await showModal({ type: 'prompt', message: msg, defaultValue: def }); }

window.switchPage = function(pageId, btnElement) {
    document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    btnElement.classList.add('active');
};

function renderMaterials() {
    const tbody = document.getElementById('materialsTableBody');
    tbody.innerHTML = '';
    materials.forEach(m => {
        tbody.innerHTML += `
            <tr>
                <td>${m.name}</td>
                <td>${Number(m.buy).toLocaleString()} دينار</td>
                <td>${Number(m.cash).toLocaleString()} دينار</td>
                <td>${Number(m.p10).toLocaleString()} دينار</td>
                <td>${Number(m.p12).toLocaleString()} دينار</td>
                <td class="action-btns">
                    <button class="btn btn-warning" onclick="editMaterial(${m.id})"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn btn-danger" onclick="deleteMaterial(${m.id})"><i class="fas fa-trash"></i> حذف</button>
                </td>
            </tr>
        `;
    });
}

window.filterMaterials = function() {
    let input = document.getElementById('searchMaterial').value.toLowerCase();
    let rows = document.getElementById('materialsTableBody').getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        let name = rows[i].getElementsByTagName('td')[0].innerText.toLowerCase();
        rows[i].style.display = name.startsWith(input) ? "" : "none";
    }
};

window.filterCustomers = function() {
    let input = document.getElementById('searchCustomer').value.toLowerCase();
    let rows = document.getElementById('customersTableBody').getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        let name = rows[i].getElementsByTagName('td')[0].innerText.toLowerCase();
        rows[i].style.display = name.startsWith(input) ? "" : "none";
    }
};

window.addMaterial = async function() {
    let name = await customPrompt("أدخل اسم المادة الجديدة:");
    if (!name) return;
    let buy = await customPrompt("سعر الشراء (دينار):") || 0;
    let cash = await customPrompt("سعر البيع نقداً (دينار):") || 0;
    let p10 = await customPrompt("سعر القسط لـ 10 أشهر (دينار):") || 0;
    let p12 = await customPrompt("سعر القسط لـ 12 شهر (دينار):") || 0;
    
    let newMat = { id: Date.now(), name, buy, cash, p10, p12 };
    materials.push(newMat);
    await saveLocalData();
    addToSyncQueue({ type: 'ADD_MATERIAL', data: newMat });
    
    renderMaterials();
    customAlert("تمت إضافة المادة بنجاح!");
};

window.editMaterial = async function(id) {
    let material = materials.find(m => m.id === id);
    
    let newName = await customPrompt("تعديل اسم المادة:", material.name);
    if (newName === null) return;
    
    let newBuy = await customPrompt("تعديل سعر الشراء (دينار):", material.buy);
    if (newBuy === null) return;
    
    let newCash = await customPrompt("تعديل البيع نقداً (دينار):", material.cash);
    if (newCash === null) return;
    
    let newP10 = await customPrompt("تعديل قسط (10 أشهر) (دينار):", material.p10);
    if (newP10 === null) return;
    
    let newP12 = await customPrompt("تعديل قسط (12 شهر) (دينار):", material.p12);
    if (newP12 === null) return;

    material.name = newName;
    material.buy = newBuy;
    material.cash = newCash;
    material.p10 = newP10;
    material.p12 = newP12;

    await saveLocalData();
    addToSyncQueue({ type: 'UPDATE_MATERIAL', data: material });

    renderMaterials();
    customAlert("تم تعديل المادة بنجاح!");
};

window.deleteMaterial = async function(id) {
    let pass = await showModal({ type: 'password_prompt', message: 'أدخل الرمز لتأكيد حذف المادة:' });
    if (pass === "1993") {
        materials = materials.filter(m => m.id !== id);
        await saveLocalData();
        addToSyncQueue({ type: 'DELETE_MATERIAL', data: { id } });
        renderMaterials();
        customAlert("تم الحذف بنجاح!");
    } else if (pass !== null) {
        customAlert("رمز خاطئ!");
    }
};

function renderCustomers() {
    const tbody = document.getElementById('customersTableBody');
    tbody.innerHTML = '';
    customers.forEach(c => {
        let statusBadge = c.isLate ? '<span class="badge late">متأخر</span>' : '<span class="badge">منتظم</span>';
        tbody.innerHTML += `
            <tr>
                <td>${c.name} ${statusBadge}</td>
                <td>${c.phone}</td>
                <td>${Number(c.totalDebt).toLocaleString()} دينار</td>
                <td class="action-btns">
                    <button class="btn btn-success" onclick="payInstallment(${c.id})"><i class="fas fa-hand-holding-usd"></i> تسديد</button>
                    <button class="btn btn-danger" onclick="addNewDebt(${c.id})"><i class="fas fa-cart-plus"></i> دين جديد</button>
                    <button class="btn btn-warning" onclick="cancelInstallment(${c.id})"><i class="fas fa-undo"></i> إلغاء التسديد</button>
                </td>
                <td class="action-btns" style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-primary" onclick="showDetails(${c.id})"><i class="fas fa-list-alt"></i> تفاصيل</button>
                        <button class="btn btn-primary" onclick="showStatement(${c.id})"><i class="fas fa-file-invoice"></i> كشف حساب</button>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-warning" onclick="editCustomer(${c.id})"><i class="fas fa-user-edit"></i> تعديل</button>
                        <button class="btn btn-danger" onclick="deleteCustomer(${c.id})"><i class="fas fa-trash-alt"></i> حذف الزبون</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

window.addCustomer = async function() {
    let res = await showModal({
        type: 'form',
        message: {
            title: 'إضافة زبون جديد',
            fields: [
                {id: 'name', label: 'اسم الزبون'},
                {id: 'notes', label: 'تفاصيل / ملاحظات'},
                {id: 'date', type: 'date', label: 'التاريخ', value: new Date().toISOString().split('T')[0]}
            ]
        }
    });
    
    if (!res || !res.name) return;
    
    let newCus = { 
        id: Date.now(), 
        name: res.name, 
        phone: "-", 
        notes: res.notes, 
        date: res.date, 
        totalDebt: 0, 
        isLate: false, 
        transactions: [] 
    };
    customers.push(newCus);
    await saveLocalData();
    addToSyncQueue({ type: 'ADD_CUSTOMER', data: newCus });
    
    renderCustomers();
    customAlert("تمت إضافة الزبون بنجاح!");
};

window.editCustomer = async function(id) {
    let customer = customers.find(c => c.id === id);
    let newName = await customPrompt("تعديل اسم الزبون:", customer.name);
    if (newName) {
        customer.name = newName;
        await saveLocalData();
        addToSyncQueue({ type: 'UPDATE_CUSTOMER', data: customer });
        renderCustomers();
        customAlert("تم تعديل بيانات الزبون بنجاح!");
    }
};

window.deleteCustomer = async function(id) {
    let pass = await showModal({ type: 'password_prompt', message: 'أدخل رمز الحذف:' });
    if (pass === "1993") {
        customers = customers.filter(c => c.id !== id);
        await saveLocalData();
        addToSyncQueue({ type: 'DELETE_CUSTOMER', data: { id } });
        renderCustomers();
        customAlert("تم حذف الزبون بنجاح!");
    } else if (pass !== null) {
        customAlert("رمز خاطئ!");
    }
};

window.payInstallment = async function(id) {
    let customer = customers.find(c => c.id === id);
    
    let res = await showModal({
        type: 'form',
        message: {
            title: 'تسديد دفعة',
            fields: [
                {id: 'total', label: 'المبلغ الكلي', value: customer.totalDebt, readonly: true},
                {id: 'amount', label: 'مبلغ التسديد', type: 'number'},
                {id: 'date', label: 'التاريخ', type: 'date', value: new Date().toISOString().split('T')[0]},
                {id: 'notes', label: 'ملاحظات'}
            ]
        }
    });
    
    if (!res || !res.amount) return;

    let payAmount = Number(res.amount);
    customer.totalDebt -= payAmount;
    customer.transactions.push({ type: 'تسديد', amount: payAmount, date: res.date, notes: res.notes });
    customer.isLate = false;
    
    await saveLocalData();
    addToSyncQueue({ type: 'UPDATE_CUSTOMER', data: customer });

    renderCustomers();
    
    await showModal({
        type: 'alert_with_print_receipt',
        message: `تم تسديد مبلغ ${payAmount.toLocaleString()} دينار للزبون ${customer.name} بنجاح!`,
        extraData: {
            customerName: customer.name,
            amount: payAmount,
            date: res.date,
            notes: res.notes,
            remainingDebt: customer.totalDebt
        }
    });
};

window.addNewDebt = async function(id) {
    let customer = customers.find(c => c.id === id);
    
    let res = await showModal({
        type: 'form',
        message: {
            title: 'إضافة دين جديد',
            fields: [
                {id: 'amount', label: 'المبلغ', type: 'number'},
                {id: 'details', label: 'التفاصيل / ملاحظات'}
            ]
        }
    });
    
    if (!res || !res.amount) return;

    let debtAmount = Number(res.amount);
    customer.totalDebt += debtAmount;
    let today = new Date().toISOString().split('T')[0];
    customer.transactions.push({ type: 'دين جديد', amount: debtAmount, date: today, notes: res.details });
    
    await saveLocalData();
    addToSyncQueue({ type: 'UPDATE_CUSTOMER', data: customer });

    renderCustomers();
    customAlert(`تمت إضافة دين بقيمة ${debtAmount.toLocaleString()} دينار للزبون ${customer.name} بنجاح!`);
};

window.editTransaction = async function(custId, transIndex) {
    let customer = customers.find(c => c.id === custId);
    let t = customer.transactions[transIndex];
    
    let newAmountStr = await customPrompt(`تعديل المبلغ للعملية (${t.type}):`, t.amount);
    if(newAmountStr === null || newAmountStr === "") return;
    
    let newAmount = Number(newAmountStr);
    let diff = newAmount - t.amount;
    
    if(t.type === 'تسديد') {
        customer.totalDebt -= diff;
    } else {
        customer.totalDebt += diff;
    }
    
    t.amount = newAmount;
    
    await saveLocalData();
    addToSyncQueue({ type: 'UPDATE_CUSTOMER', data: customer });
    renderCustomers();
    
    // إعادة فتح النافذة لتحديث البيانات
    showDetails(custId);
};

window.deleteTransaction = async function(custId, transIndex) {
    let pass = await showModal({ type: 'password_prompt', message: 'أدخل الرمز لتأكيد حذف المعاملة:' });
    if (pass !== "1993") {
        if (pass !== null) customAlert("رمز خاطئ!");
        return;
    }

    let customer = customers.find(c => c.id === custId);
    let t = customer.transactions[transIndex];
    
    if(t.type === 'تسديد') {
        customer.totalDebt += t.amount;
    } else {
        customer.totalDebt -= t.amount;
    }
    
    customer.transactions.splice(transIndex, 1);
    
    await saveLocalData();
    addToSyncQueue({ type: 'UPDATE_CUSTOMER', data: customer });
    renderCustomers();
    
    // إعادة فتح النافذة لتحديث البيانات
    showDetails(custId);
};

window.showDetails = async function(id) {
    let customer = customers.find(c => c.id === id);
    let detailsText = customer.transactions.map((t, index) => `
        <div style="border-bottom: 2px dashed rgba(255,255,255,0.4); padding: 15px 0; text-align: right;">
            <p>📅 التاريخ: ${t.date}</p>
            <p>النوع: ${t.type}</p>
            <p>المبلغ: ${Number(t.amount).toLocaleString()} دينار</p>
            <p>التفاصيل: ${t.notes}</p>
            <div style="margin-top: 10px; display: flex; gap: 10px;">
                <button class="btn btn-warning" onclick="editTransaction(${id}, ${index})"><i class="fas fa-edit"></i> تعديل</button>
                <button class="btn btn-danger" onclick="deleteTransaction(${id}, ${index})"><i class="fas fa-trash"></i> حذف</button>
            </div>
        </div>
    `).join('');
    
    let msg = `
        <div style="max-height: 400px; overflow-y: auto; padding-left: 10px;">
            <h3 style="margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 10px;">
                تفاصيل الزبون: ${customer.name}
            </h3>
            ${detailsText || '<p style="text-align:center;">لا توجد تفاصيل حالياً</p>'}
        </div>
    `;
    
    await showModal({
        type: 'alert_with_print_statement',
        message: msg,
        extraData: { customerId: id }
    });
};

window.cancelInstallment = async function(id) {
    let customer = customers.find(c => c.id === id);
    let payments = customer.transactions.filter(t => t.type === 'تسديد');
    
    if (payments.length === 0) {
        await customAlert("لا يوجد تسديدات سابقة لإلغائها.");
        return;
    }

    let res = await showModal({
        type: 'form',
        message: {
            title: 'إلغاء التسديد',
            fields: [
                {
                    id: 'paymentToCancel', 
                    label: 'الأشهر المسددة (اختر للإلغاء)', 
                    type: 'select', 
                    options: payments.map((p, index) => ({value: index, text: `تاريخ: ${p.date} - مبلغ: ${Number(p.amount).toLocaleString()} دينار`}))
                }
            ]
        }
    });
    
    if (res && res.paymentToCancel !== null && res.paymentToCancel !== "") {
        let pIndex = Number(res.paymentToCancel);
        let payment = payments[pIndex];
        
        customer.totalDebt += payment.amount;
        
        let exactIndex = customer.transactions.indexOf(payment);
        if(exactIndex > -1) {
            customer.transactions.splice(exactIndex, 1);
        }
        
        await saveLocalData();
        addToSyncQueue({ type: 'UPDATE_CUSTOMER', data: customer });

        renderCustomers();
        customAlert("تم إلغاء التسديد وإرجاع المبلغ للرصيد بنجاح!");
    }
};

window.showStatement = async function(id) {
    let customer = customers.find(c => c.id === id);
    let transText = customer.transactions.filter(t => t.type !== 'تسديد').map(t => `📅 ${t.date} | ${t.type}: ${Number(t.amount).toLocaleString()} | ملاحظات: ${t.notes}`).join('<br>');
    let msg = `
        <div style="text-align: right; line-height: 1.8;">
            <p><strong>الاسم:</strong> ${customer.name}</p>
            <p><strong>رقم الهاتف:</strong> ${customer.phone}</p>
            <p><strong>الرصيد الكلي المتبقي:</strong> ${Number(customer.totalDebt).toLocaleString()} دينار</p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 15px 0;">
            <p><strong>سجل العمليات:</strong></p>
            <div style="font-size: 0.95rem; max-height: 200px; overflow-y: auto;">
                ${transText || 'لا توجد عمليات مسجلة'}
            </div>
        </div>
    `;
    
    await showModal({
        type: 'alert_with_print_statement',
        message: msg,
        extraData: { customerId: id }
    });
};

window.showLateCustomers = async function() {
    let lateList = customers.filter(c => c.isLate).map(c => c.name).join("<br>- ");
    if (lateList) {
        await customAlert("<div style='text-align:right'>قائمة الزبائن المتأخرين:<br><br>- " + lateList + "</div>");
    } else {
        await customAlert("لا يوجد زبائن متأخرين حالياً.");
    }
};

window.printData = function(title, contentHTML) {
    let printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html lang="ar" dir="rtl"><head><title>' + title + '</title>');
    printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">');
    printWindow.document.write('<style>');
    printWindow.document.write('body{font-family:"Tajawal",sans-serif; padding:20px; text-align:right;}');
    printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
    printWindow.document.write('th,td{border:1px solid #ddd;padding:10px;text-align:right;}');
    printWindow.document.write('th{background-color:#f2f2f2;}');
    printWindow.document.write('.header{text-align:center;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:10px;}');
    printWindow.document.write('.footer{margin-top:40px; text-align:center; font-weight:bold;}');
    printWindow.document.write('</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write('<div class="header"><h2>' + title + '</h2></div>');
    printWindow.document.write(contentHTML);
    printWindow.document.write('<div class="footer"><p>نظام إدارة المواد والأقساط</p></div>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
};

window.printReceipt = function(customerName, amount, date, notes, remainingDebt) {
    let receiptNumber = Math.floor(1000 + Math.random() * 9000);
    let previousDebt = Number(remainingDebt) + Number(amount);
    let currentDate = new Date().toLocaleString('en-GB');
    
    let contentHTML = `
        <div class="receipt-container">
            <div class="receipt-header-box">
                <h2 style="margin: 0; font-size: 16px;">مجمع كامل فون للتقسيط</h2>
                <p style="margin: 3px 0; font-size: 11px;">اجهزة كهربائية - اثاث منزلية - موبايلات</p>
                <p style="margin: 3px 0; font-size: 12px; font-weight: bold; direction: ltr;">0773 676 1213 &nbsp;&nbsp; 0781 800 7750</p>
            </div>
            
            <div class="receipt-info-row">
                <span>تأريخ: ${date}</span>
                <span>رقم الوصل: ${receiptNumber}</span>
            </div>
            
            <div class="receipt-customer-box">
                أسم الزبون ${customerName}
            </div>
            
            <div class="receipt-notes">
                الملاحظات: ${notes || ''}
            </div>
            
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th>دينار</th>
                        <th>دولار</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>${Number(previousDebt).toLocaleString()}</td>
                        <td>الديون</td>
                    </tr>
                    <tr>
                        <td>${Number(amount).toLocaleString()}</td>
                        <td>الواصل</td>
                    </tr>
                    <tr>
                        <td>${Number(remainingDebt).toLocaleString()}</td>
                        <td>المتبقي</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="receipt-footer-time">
                ${currentDate}
            </div>
        </div>
    `;

    let printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html lang="ar" dir="rtl"><head><title>طباعة وصل</title>');
    printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">');
    printWindow.document.write('<style>');
    printWindow.document.write(`
        @page { size: 80mm 130mm; margin: 0; }
        body { 
            font-family: 'Tajawal', sans-serif; 
            margin: 0; 
            padding: 10mm 5px;
            background: #fff; 
            color: #000; 
            width: 80mm;
            height: 130mm;
            box-sizing: border-box;
            overflow: hidden;
        }
        .receipt-container { width: 100%; height: 110mm; }
        .receipt-header-box { border: 1px solid #000; text-align: center; padding: 5px; margin-bottom: 8px; }
        .receipt-info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-weight: bold; font-size: 12px;}
        .receipt-customer-box { border: 1px solid #000; border-radius: 15px; padding: 5px; text-align: right; font-weight: bold; font-size: 12px; margin: 0 5px 8px 5px; }
        .receipt-notes { text-align: right; font-weight: bold; margin-bottom: 8px; font-size: 12px;}
        .receipt-table { width: 100%; border-collapse: collapse; text-align: center; font-weight: bold; margin-bottom: 8px;}
        .receipt-table th { font-weight: normal; font-size: 12px; padding-bottom: 3px;}
        .receipt-table td { border: 1px solid #000; padding: 5px; font-size: 13px;}
        .receipt-table td:first-child { width: 50%; }
        .receipt-table td:nth-child(2) { width: 50%; }
        .receipt-footer-time { text-align: center; font-size: 10px; margin-top: 5px; direction: ltr;}
    `);
    printWindow.document.write('</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(contentHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
};

window.printStatement = function(customer) {
    let transRows = customer.transactions.map(t => `<tr><td>${t.date}</td><td>${t.type}</td><td>${Number(t.amount).toLocaleString()}</td><td>${t.notes || '-'}</td></tr>`).join('');
    let content = `
        <p><strong>اسم الزبون:</strong> ${customer.name}</p>
        <p><strong>رقم الهاتف:</strong> ${customer.phone}</p>
        <p><strong>الرصيد الكلي المتبقي:</strong> ${Number(customer.totalDebt).toLocaleString()} دينار</p>
        <table>
            <thead>
                <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>المبلغ (دينار)</th>
                    <th>ملاحظات</th>
                </tr>
            </thead>
            <tbody>
                ${transRows || '<tr><td colspan="4" style="text-align:center;">لا توجد عمليات مسجلة</td></tr>'}
            </tbody>
        </table>
    `;
    printData('كشف حساب / معاملات الزبون', content);
};

window.openSystem = async function(systemType) {
    let pass = await showModal({ type: 'password_prompt', message: 'أدخل رمز الدخول:' });
    if (pass === "1991") {
        document.getElementById('landingPage').style.display = 'none';
        document.querySelector('.sidebar').style.display = 'flex';
        document.querySelector('.main-content').style.display = 'block';
        await loadLocalData();
        
        if (systemType === 'materials') {
            switchPage('materialsPage', document.querySelectorAll('.nav-btn')[0]);
        } else {
            switchPage('installmentsPage', document.querySelectorAll('.nav-btn')[1]);
        }
    } else if (pass !== null) {
        await customAlert("رمز خاطئ!");
    }
};

window.onload = async function() {
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'none';
};
