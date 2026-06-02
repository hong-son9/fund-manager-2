// Initialize database from config
const db = IS_CONFIGURED
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!IS_CONFIGURED) {
    document.getElementById('configBanner').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('tbody').innerHTML = '<tr><td colspan="7"><div class="state-box"><div class="icon">⚙️</div><h3>Chưa cấu hình Supabase</h3><p>Xem hướng dẫn ở banner phía trên</p></div></td></tr>';
}

var rows    = [];
var delId   = null;
var isAdmin = false;
var currentDetailId = null;
var selectedImageFile = null;
var removeImageFlag = false;
var isSaving = false;   // chống double-submit khi mạng/máy lác

/* ===== WORKSPACE STATE ===== */
var workspaces           = [];     // [{id,name,slug,icon,sort_order,is_public,...}]
var currentWorkspace     = null;   // workspace object đang xem (null = đang ở selector)
var deleteWsId           = null;
var workspacesInitialized = false; // đã fetch workspace lần đầu chưa

/* ===== AUTH STATE ===== */
function setAdminUI(loggedIn) {
    var changed = isAdmin !== loggedIn;
    isAdmin = loggedIn;
    document.getElementById('adminControls').style.display = loggedIn ? 'flex' : 'none';
    document.getElementById('btnLogin').style.display      = loggedIn ? 'none' : 'flex';
    // Nút QR chỉ dành cho người xem (góp tiền vào quỹ). Admin không cần.
    // Việc ẩn/hiện cụ thể do updateHeaderForState() xử lý theo state (in-workspace + !admin).
    document.querySelector('table').classList.toggle('admin-mode', loggedIn);
    updateHeaderForState();
    // Re-render selector cards to refresh empty-state hint nếu đang ở selector
    if (!currentWorkspace) renderWorkspaceCards();
    render();

    // Khi auth state đổi, danh sách quỹ thấy được có thể đổi (admin thấy hết, khách chỉ thấy is_public)
    // => fetch lại workspaces.
    if (changed && IS_CONFIGURED && workspacesInitialized) {
        if (currentWorkspace) {
            loadWorkspacesPreserveCurrent().then(function() {
                // Nếu quỹ đang xem bị ẩn và user vừa logout -> không thấy nữa, kick về selector
                var still = workspaces.find(function(w){ return w.id === currentWorkspace.id; });
                if (!still) showSelector();
            });
        } else {
            loadWorkspaces();
        }
    }
}

if (IS_CONFIGURED) {
    db.auth.getSession().then(function(res) {
        setAdminUI(!!(res.data && res.data.session));
    });
    db.auth.onAuthStateChange(function(event, session) {
        setAdminUI(!!session);
    });
}

/* ===== LOGIN / LOGOUT ===== */
function openLogin() { document.getElementById('modalLogin').classList.add('open'); }

async function doLogin() {
    var email = document.getElementById('lEmail').value.trim();
    var pass  = document.getElementById('lPass').value;
    if (!email || !pass) { toast('Vui lòng nhập đủ thông tin!', 'error'); return; }
    var { error } = await db.auth.signInWithPassword({ email: email, password: pass });
    if (error) { toast('Sai email hoặc mật khẩu!', 'error'); return; }
    closeModal('modalLogin');
    toast('Đăng nhập thành công!', 'success');
}

async function doLogout() {
    await db.auth.signOut();
    toast('Đã đăng xuất!', 'success');
}

/* ===== UTILS ===== */
function money(n) {
    if (!n || n === 0) return null;
    return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}
function moneyFull(n) {
    return new Intl.NumberFormat('vi-VN').format(n || 0) + ' đ';
}
function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}
function today() { return new Date().toISOString().split('T')[0]; }
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function slugify(str) {
    var base = str.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!base) base = 'quy';
    // Append hậu tố thời gian để chắc chắn unique
    return base + '-' + Date.now().toString(36).slice(-5);
}

/* ===== WORKSPACE: LOAD & ROUTING ===== */
async function loadWorkspaces() {
    if (!IS_CONFIGURED) return;
    var { data, error } = await db
        .from('workspaces')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id',         { ascending: true });
    if (error) { toast('Lỗi tải danh sách quỹ!', 'error'); return; }
    workspaces = data || [];
    workspacesInitialized = true;

    if (workspaces.length === 1) {
        // Chỉ có 1 quỹ → vào thẳng
        selectWorkspace(workspaces[0]);
    } else {
        // 0 hoặc >1 quỹ → luôn hiện selector (theo yêu cầu: mỗi lần vào phải chọn)
        showSelector();
    }
}

function showSelector() {
    currentWorkspace = null;
    rows = [];
    document.getElementById('workspaceSelectorScreen').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    document.title = 'Quỹ Anh Em';
    renderWorkspaceCards();
    updateHeaderForState();
}

function selectWorkspace(ws) {
    currentWorkspace = ws;
    document.getElementById('workspaceSelectorScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.title = ws.name;
    applyWorkspaceLayout();
    updateHeaderForState();
    load();
}

function isTrip(ws) { return ws && ws.type === 'trip'; }

// Đổi tiêu đề cột 6 + ẩn/hiện Ghi chú trong form theo type của quỹ hiện tại
function applyWorkspaceLayout() {
    var trip = isTrip(currentWorkspace);
    var col6 = document.getElementById('colHead6');
    if (col6) col6.textContent = trip ? 'Ghi Chú' : 'Tổng Còn Lại';
    var grp = document.getElementById('fGhiChuGroup');
    if (grp) grp.style.display = trip ? 'block' : 'none';
}

function selectWorkspaceById(id) {
    var ws = workspaces.find(function(x) { return x.id === id; });
    if (ws) selectWorkspace(ws);
}

function backToSelector() {
    if (workspaces.length > 1) showSelector();
}

function updateHeaderForState() {
    var inWs     = !!currentWorkspace;
    var hasMulti = workspaces.length > 1;

    // Brand
    var logoEl  = document.getElementById('brandLogo');
    var titleEl = document.getElementById('brandTitle');
    if (inWs) {
        logoEl.textContent  = currentWorkspace.icon || '💰';
        titleEl.textContent = currentWorkspace.name;
    } else {
        logoEl.textContent  = '💰';
        titleEl.textContent = 'Quỹ Anh Em';
    }

    // Buttons (state-dependent)
    // QR (góp tiền) chỉ hiện cho người xem, không hiện cho admin
    document.getElementById('btnQr').style.display       = (inWs && !isAdmin) ? 'flex' : 'none';
    document.getElementById('btnSwitchWs').style.display = (inWs && hasMulti) ? 'flex' : 'none';

    // Admin-only buttons (chỉ khi đã login)
    if (isAdmin) {
        document.getElementById('btnAddTx').style.display    = inWs ? 'flex' : 'none';
        document.getElementById('btnManageWs').style.display = 'flex';
    }
}

function renderWorkspaceCards() {
    var grid = document.getElementById('workspaceGrid');
    if (!grid) return;
    if (workspaces.length === 0) {
        grid.innerHTML = '<div class="ws-empty"><div class="icon">📂</div><h3>Chưa có quỹ nào</h3><p>' +
            (isAdmin ? 'Nhấn nút "Quản lý quỹ" trên thanh tiêu đề để tạo quỹ đầu tiên'
                     : 'Vui lòng đợi admin tạo quỹ') +
            '</p></div>';
        return;
    }
    grid.innerHTML = workspaces.map(function(ws) {
        return '<div class="ws-card" onclick="selectWorkspaceById(' + ws.id + ')">' +
            '<div class="ws-card-icon">' + (ws.icon || '💰') + '</div>' +
            '<div class="ws-card-name">' + escHtml(ws.name) + '</div>' +
            '<div class="ws-card-arrow">→</div>' +
        '</div>';
    }).join('');
}

/* ===== WORKSPACE: MANAGE (admin) ===== */
function openManageWs() {
    renderManageList();
    document.getElementById('wsName').value = '';
    document.getElementById('wsIcon').value = '';
    document.getElementById('wsPublic').checked = true;
    var defaultRadio = document.querySelector('input[name="wsType"][value="cashflow"]');
    if (defaultRadio) defaultRadio.checked = true;
    document.getElementById('modalManage').classList.add('open');
}

function renderManageList() {
    var list = document.getElementById('manageList');
    if (workspaces.length === 0) {
        list.innerHTML = '<div class="manage-empty">Chưa có quỹ nào</div>';
        return;
    }
    list.innerHTML = workspaces.map(function(ws) {
        var isPub = ws.is_public !== false; // default treat as public if cột chưa có
        var visBtn = isPub
            ? '<button class="btn-icon vis on"  onclick="toggleWsVisibility(' + ws.id + ')" title="Đang công khai — bấm để ẩn">👁️</button>'
            : '<button class="btn-icon vis off" onclick="toggleWsVisibility(' + ws.id + ')" title="Đang ẩn — bấm để công khai">🔒</button>';
        var badgeVis = isPub
            ? '<span class="ws-vis-badge public">Công khai</span>'
            : '<span class="ws-vis-badge private">Đã ẩn</span>';
        var badgeType = (ws.type === 'trip')
            ? '<span class="ws-type-badge trip">✈️ Đóng quỹ</span>'
            : '<span class="ws-type-badge cashflow">📊 Sổ thu/chi</span>';
        return '<div class="manage-item">' +
            '<div class="manage-item-info">' +
                '<span class="manage-item-icon">' + (ws.icon || '💰') + '</span>' +
                '<span class="manage-item-name">' + escHtml(ws.name) + '</span>' +
                badgeType + badgeVis +
            '</div>' +
            '<div class="manage-item-actions">' +
                visBtn +
                '<button class="btn-icon del" onclick="confirmDeleteWorkspace(' + ws.id + ')" title="Xóa quỹ">🗑️</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

async function toggleWsVisibility(id) {
    var ws = workspaces.find(function(x){ return x.id === id; });
    if (!ws) return;
    var newVal = !(ws.is_public !== false);
    var { error } = await db.from('workspaces').update({ is_public: newVal }).eq('id', id);
    if (error) { toast('Lỗi: ' + error.message, 'error'); return; }
    toast(newVal ? 'Đã công khai quỹ "' + ws.name + '"' : 'Đã ẩn quỹ "' + ws.name + '" với người xem', 'success');
    await loadWorkspacesPreserveCurrent();
    renderManageList();
}

async function addWorkspace() {
    var name = document.getElementById('wsName').value.trim();
    var icon = document.getElementById('wsIcon').value.trim() || '💰';
    var isPublic = document.getElementById('wsPublic').checked;
    var typeEl   = document.querySelector('input[name="wsType"]:checked');
    var type     = typeEl ? typeEl.value : 'cashflow';
    if (!name) { toast('Vui lòng nhập tên quỹ!', 'error'); return; }

    var slug = slugify(name);
    var { error } = await db.from('workspaces').insert({
        name: name,
        slug: slug,
        icon: icon,
        sort_order: workspaces.length,
        is_public: isPublic,
        type: type
    });
    if (error) { toast('Lỗi: ' + error.message, 'error'); return; }

    document.getElementById('wsName').value = '';
    document.getElementById('wsIcon').value = '';
    document.getElementById('wsPublic').checked = true;
    var defaultRadio = document.querySelector('input[name="wsType"][value="cashflow"]');
    if (defaultRadio) defaultRadio.checked = true;
    toast('Đã thêm quỹ "' + name + '"!', 'success');

    await loadWorkspacesPreserveCurrent();
    renderManageList();
}

function confirmDeleteWorkspace(id) {
    var ws = workspaces.find(function(x){ return x.id === id; });
    if (!ws) return;
    deleteWsId = id;
    document.getElementById('delWsName').textContent = ws.name;
    document.getElementById('modalDelWs').classList.add('open');
}

async function doDeleteWorkspace() {
    if (!deleteWsId) return;
    var deletedId = deleteWsId;
    var { error } = await db.from('workspaces').delete().eq('id', deletedId);
    if (error) { toast('Lỗi: ' + error.message, 'error'); return; }
    closeModal('modalDelWs');
    toast('Đã xóa quỹ!', 'success');
    deleteWsId = null;

    var wasCurrent = currentWorkspace && currentWorkspace.id === deletedId;
    if (wasCurrent) {
        // Quỹ đang xem bị xóa → quay về selector
        currentWorkspace = null;
        await loadWorkspaces();   // sẽ tự routing
    } else {
        await loadWorkspacesPreserveCurrent();
    }
    renderManageList();
}

// Reload workspaces nhưng KHÔNG đổi màn hình hiện tại (dùng khi đang ở manage modal)
async function loadWorkspacesPreserveCurrent() {
    var { data, error } = await db
        .from('workspaces')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id',         { ascending: true });
    if (error) return;
    workspaces = data || [];
    // Đồng bộ object currentWorkspace nếu nó vẫn còn
    if (currentWorkspace) {
        var fresh = workspaces.find(function(x){ return x.id === currentWorkspace.id; });
        if (fresh) currentWorkspace = fresh;
    }
    if (!currentWorkspace) renderWorkspaceCards();
    updateHeaderForState();
}

/* ===== LOAD TRANSACTIONS ===== */
async function load() {
    if (!IS_CONFIGURED || !currentWorkspace) return;
    var { data, error } = await db
        .from('transactions')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('ngay', { ascending: true })
        .order('id',   { ascending: true });

    if (error) { toast('Lỗi tải dữ liệu!', 'error'); return; }

    // Tính running balance theo thứ tự cũ → mới
    var bal = 0;
    var withBal = (data || []).map(function(t) {
        bal += (t.tien_vao || 0) - (t.tien_ra || 0);
        return Object.assign({}, t, { tongConLai: bal });
    });
    // Đảo ngược: mới nhất lên đầu
    rows = withBal.slice().reverse();
    render();
    stats();
}

/* ===== RENDER ===== */
function render() {
    var tbody = document.getElementById('tbody');
    if (!tbody) return;
    document.getElementById('recCount').textContent = rows.length + ' giao dịch';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="state-box"><div class="icon">📭</div><h3>Chưa có giao dịch nào</h3><p>' +
            (isAdmin ? 'Nhấn "Thêm giao dịch" để bắt đầu' : 'Quỹ này chưa có giao dịch') +
            '</p></div></td></tr>';
        return;
    }

    var trip = isTrip(currentWorkspace);
    tbody.innerHTML = rows.map(function(t, i) {
        var vao = t.tien_vao || 0;
        var ra  = t.tien_ra  || 0;
        var bal = t.tongConLai || 0;
        var vaoCell = vao > 0 ? '<td class="money-in">+' + money(vao) + '</td>' : '<td class="money-dash">—</td>';
        var raCell  = ra  > 0 ? '<td class="money-out">−' + money(ra)  + '</td>' : '<td class="money-dash">—</td>';
        var col6 = trip
            ? '<td class="ghi-chu">' + (t.ghi_chu ? escHtml(t.ghi_chu) : '<span style="color:#cbd5e0">—</span>') + '</td>'
            : '<td><span class="bal ' + (bal >= 0 ? 'pos' : 'neg') + '">' + moneyFull(bal) + '</span></td>';
        return '<tr onclick="openDetail(' + t.id + ')" style="cursor:pointer">'
            + '<td class="stt">' + (i+1) + '</td>'
            + '<td><span class="date-badge">' + fmtDate(t.ngay) + '</span></td>'
            + vaoCell + raCell
            + '<td class="noidung">' + (t.noi_dung ? escHtml(t.noi_dung) : '<span style="color:#cbd5e0">—</span>') + '</td>'
            + col6
            + '<td><div class="action-btns">'
            + (isAdmin
                ? '<button class="btn-icon edit" onclick="event.stopPropagation(); openEdit(' + t.id + ')" title="Sửa">✏️</button>'
                + '<button class="btn-icon del" onclick="event.stopPropagation(); openDel(' + t.id + ')" title="Xóa">🗑️</button>'
                : '<span style="color:#cbd5e0;font-size:18px">—</span>')
            + '</div></td></tr>';
    }).join('');
}

/* ===== STATS ===== */
function stats() {
    var totalIn = 0, totalOut = 0;
    rows.forEach(function(t) { totalIn += t.tien_vao||0; totalOut += t.tien_ra||0; });
    var bal = totalIn - totalOut;
    document.getElementById('statIn').textContent  = moneyFull(totalIn);
    document.getElementById('statOut').textContent = moneyFull(totalOut);
    var el = document.getElementById('statBal');
    el.textContent = moneyFull(bal);
    el.className   = 'stat-value ' + (bal >= 0 ? 'blue' : 'danger');
}

/* ===== OPEN QR ===== */
function openQR() { document.getElementById('modalQR').classList.add('open'); }

/* ===== FIX YEAR — giới hạn năm 4 chữ số ===== */
function fixYear(input) {
    if (!input.value) return;
    var parts = input.value.split('-');
    if (parts[0] && parts[0].length > 4) {
        parts[0] = parts[0].slice(0, 4);
        input.value = parts.join('-');
    }
}

/* ===== MUTUAL EXCLUSIVE: tiền vào / tiền ra ===== */
function initMoneyFields() {
    var vao = document.getElementById('fVao');
    var ra  = document.getElementById('fRa');
    vao.addEventListener('input', function() {
        var v = parseFloat(this.value) || 0;
        ra.disabled      = v > 0;
        ra.style.opacity = v > 0 ? '0.35' : '1';
        ra.style.cursor  = v > 0 ? 'not-allowed' : '';
        if (v > 0) ra.value = '';
    });
    ra.addEventListener('input', function() {
        var v = parseFloat(this.value) || 0;
        vao.disabled      = v > 0;
        vao.style.opacity = v > 0 ? '0.35' : '1';
        vao.style.cursor  = v > 0 ? 'not-allowed' : '';
        if (v > 0) vao.value = '';
    });
}
function resetMoneyFields() {
    ['fVao','fRa'].forEach(function(id) {
        var el = document.getElementById(id);
        el.disabled = false; el.style.opacity = '1'; el.style.cursor = '';
    });
}
initMoneyFields();

/* ===== IMAGE PREVIEW ===== */
function initImagePreview() {
    var fileInput = document.getElementById('fAnh');
    var removeButton = document.getElementById('removeImageBtn');
    fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) {
            removeImageFlag = false;
            selectedImageFile = file;
            removeButton.style.display = 'inline-flex';
            var reader = new FileReader();
            reader.onload = function(event) {
                document.getElementById('previewImg').src = event.target.result;
                document.getElementById('previewAnh').style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            selectedImageFile = null;
            document.getElementById('previewAnh').style.display = 'none';
            removeButton.style.display = 'none';
        }
    });
    removeButton.addEventListener('click', removeImageFromForm);
}
function removeImageFromForm() {
    selectedImageFile = null;
    removeImageFlag = true;
    document.getElementById('fAnh').value = '';
    document.getElementById('previewAnh').style.display = 'none';
    document.getElementById('removeImageBtn').style.display = 'none';
}
initImagePreview();

/* ===== OPEN ADD ===== */
function openAdd() {
    if (!currentWorkspace) { toast('Hãy chọn quỹ trước!', 'error'); return; }
    document.getElementById('modalTitle').textContent = '➕ Thêm giao dịch';
    document.getElementById('fId').value      = '';
    document.getElementById('fNgay').value    = today();
    document.getElementById('fVao').value     = '';
    document.getElementById('fRa').value      = '';
    document.getElementById('fNoidung').value = '';
    document.getElementById('fGhiChu').value  = '';
    document.getElementById('fAnh').value     = '';
    selectedImageFile = null;
    removeImageFlag = false;
    document.getElementById('previewAnh').style.display = 'none';
    document.getElementById('removeImageBtn').style.display = 'none';
    resetMoneyFields();
    document.getElementById('modalForm').classList.add('open');
    setTimeout(function(){ document.getElementById('fNgay').focus(); }, 120);
}

/* ===== OPEN EDIT ===== */
function openEdit(id) {
    var t = rows.find(function(x){ return x.id === id; });
    if (!t) return;
    document.getElementById('modalTitle').textContent = '✏️ Sửa giao dịch';
    document.getElementById('fId').value      = t.id;
    document.getElementById('fNgay').value    = t.ngay;
    resetMoneyFields();
    document.getElementById('fVao').value     = t.tien_vao > 0 ? t.tien_vao : '';
    document.getElementById('fRa').value      = t.tien_ra  > 0 ? t.tien_ra  : '';
    if (t.tien_vao > 0) { document.getElementById('fRa').disabled = true;  document.getElementById('fRa').style.opacity  = '0.35'; }
    if (t.tien_ra  > 0) { document.getElementById('fVao').disabled = true; document.getElementById('fVao').style.opacity = '0.35'; }
    document.getElementById('fNoidung').value = t.noi_dung || '';
    document.getElementById('fGhiChu').value  = t.ghi_chu || '';
    document.getElementById('fAnh').value     = '';
    selectedImageFile = null;
    removeImageFlag = false;
    if (t.anh_url) {
        document.getElementById('previewImg').src = t.anh_url;
        document.getElementById('previewAnh').style.display = 'block';
        document.getElementById('removeImageBtn').style.display = 'inline-flex';
    } else {
        document.getElementById('previewAnh').style.display = 'none';
        document.getElementById('removeImageBtn').style.display = 'none';
    }
    document.getElementById('modalForm').classList.add('open');
}

/* ===== SAVE ===== */
function setSaveBusy(busy) {
    var btn = document.getElementById('btnSave');
    if (!btn) return;
    if (busy) {
        if (!btn.dataset.original) btn.dataset.original = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> Đang lưu...';
    } else {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (btn.dataset.original) {
            btn.innerHTML = btn.dataset.original;
            delete btn.dataset.original;
        }
    }
}

async function save() {
    // Guard chống double-submit: chặn ngay cả khi click 2-3 lần liên tiếp
    if (isSaving) return;

    if (!currentWorkspace) { toast('Không xác định được quỹ!', 'error'); return; }
    var id      = document.getElementById('fId').value;
    var ngay    = document.getElementById('fNgay').value;
    var vao     = document.getElementById('fVao').value;
    var ra      = document.getElementById('fRa').value;
    var noidung = document.getElementById('fNoidung').value.trim();
    var ghichu  = document.getElementById('fGhiChu').value.trim();

    if (!ngay)      { toast('Vui lòng chọn ngày!', 'error'); return; }
    var year = parseInt(ngay.split('-')[0]);
    if (isNaN(year) || year < 2000 || year > 2099) { toast('Năm không hợp lệ! Chỉ nhập 4 chữ số (2000–2099).', 'error'); document.getElementById('fNgay').focus(); return; }
    if (!vao && !ra){ toast('Vui lòng nhập tiền vào hoặc tiền ra!', 'error'); return; }

    // Validation xong → khoá nút trước khi bắt đầu mọi async work
    isSaving = true;
    setSaveBusy(true);

    try {
        var payload = {
            ngay:     ngay,
            tien_vao: vao ? parseFloat(vao) : 0,
            tien_ra:  ra  ? parseFloat(ra)  : 0,
            noi_dung: noidung || null,
            ghi_chu:  ghichu  || null,
            workspace_id: currentWorkspace.id
        };

        // Handle image upload
        if (selectedImageFile) {
            try {
                var fileName = 'transaction_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                var upsert = !id;

                var uploadRes = await db.storage
                    .from('transaction-images')
                    .upload(fileName, selectedImageFile, { upsert: upsert });

                if (uploadRes.error) {
                    console.error('Upload error:', uploadRes.error);
                    toast('Lỗi upload ảnh: ' + uploadRes.error.message, 'error');
                    return;
                }

                var urlRes = db.storage
                    .from('transaction-images')
                    .getPublicUrl(fileName);

                if (urlRes && urlRes.data) {
                    payload.anh_url = urlRes.data.publicUrl;
                }
            } catch (err) {
                console.error('Upload exception:', err);
                toast('Lỗi: ' + err.message, 'error');
                return;
            }
        } else if (removeImageFlag) {
            payload.anh_url = null;
        }

        var error;
        try {
            if (id) {
                // Khi update, KHÔNG đổi workspace_id (giữ nguyên), tránh việc move giao dịch sang quỹ khác bằng nhầm
                var updatePayload = Object.assign({}, payload);
                delete updatePayload.workspace_id;
                var resU = await db.from('transactions').update(updatePayload).eq('id', id);
                error = resU.error;
            } else {
                var resI = await db.from('transactions').insert(payload);
                error = resI.error;
            }
        } catch (err) {
            console.error('Database error:', err);
            toast('Lỗi: ' + err.message, 'error');
            return;
        }

        if (error) { toast('Có lỗi xảy ra: ' + error.message, 'error'); return; }
        closeModal('modalForm');
        toast(id ? 'Cập nhật thành công!' : 'Thêm giao dịch thành công!', 'success');
        selectedImageFile = null;
        load();
    } finally {
        // Luôn mở khoá nút dù thành công hay lỗi
        isSaving = false;
        setSaveBusy(false);
    }
}

/* ===== DELETE ===== */
function openDel(id) { delId = id; document.getElementById('modalDel').classList.add('open'); }
async function doDelete() {
    if (!delId) return;
    var { error } = await db.from('transactions').delete().eq('id', delId);
    if (error) { toast('Có lỗi xảy ra!', 'error'); return; }
    closeModal('modalDel');
    toast('Đã xóa giao dịch!', 'success');
    delId = null;
    load();
}

/* ===== DETAIL MODAL ===== */
function openDetail(id) {
    currentDetailId = id;
    var t = rows.find(function(x){ return x.id === id; });
    if (!t) return;

    document.getElementById('detailNgay').textContent = fmtDate(t.ngay);
    document.getElementById('detailVao').textContent = (t.tien_vao > 0) ? '+' + moneyFull(t.tien_vao) : '—';
    document.getElementById('detailRa').textContent = (t.tien_ra > 0) ? '−' + moneyFull(t.tien_ra) : '—';
    document.getElementById('detailNoidung').textContent = t.noi_dung || '—';

    // Trip workspace -> hiện Ghi chú, ẩn Số dư. Cashflow -> ngược lại.
    var trip = isTrip(currentWorkspace);
    document.getElementById('detailGhiChuBox').style.display = trip ? 'block' : 'none';
    document.getElementById('detailBalBox').style.display    = trip ? 'none'  : 'block';
    if (trip) {
        document.getElementById('detailGhiChu').textContent = t.ghi_chu || '—';
    } else {
        var bal = t.tongConLai || 0;
        var balEl = document.getElementById('detailBal');
        balEl.textContent = moneyFull(bal);
        balEl.className = 'detail-value num';
        balEl.style.color = bal >= 0 ? 'var(--info-strong)' : 'var(--danger-strong)';
        balEl.style.fontWeight = '700';
    }

    if (t.anh_url) {
        var detailImg = document.getElementById('detailImage');
        detailImg.src = t.anh_url;
        detailImg.style.cursor = 'pointer';
        detailImg.onclick = function() { openImageViewer(t.anh_url); };
        document.getElementById('detailImageBox').style.display = 'block';
    } else {
        document.getElementById('detailImageBox').style.display = 'none';
    }

    document.getElementById('detailFooter').style.display = isAdmin ? 'flex' : 'none';

    document.getElementById('modalDetail').classList.add('open');
}

function editFromDetail() {
    closeModal('modalDetail');
    setTimeout(function(){ openEdit(currentDetailId); }, 200);
}

function deleteFromDetail() {
    closeModal('modalDetail');
    setTimeout(function(){ openDel(currentDetailId); }, 200);
}

/* ===== IMAGE VIEWER ===== */
function openImageViewer(src) {
    document.getElementById('imageViewerImg').src = src;
    document.getElementById('imageViewer').classList.add('open');
}

function closeImageViewer() {
    document.getElementById('imageViewer').classList.remove('open');
}

document.getElementById('imageViewer').addEventListener('click', function(e) {
    if (e.target === this) closeImageViewer();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('imageViewer').classList.contains('open')) {
        closeImageViewer();
    }
});

/* ===== MODAL HELPERS ===== */
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.overlay').forEach(function(el) {
    el.addEventListener('click', function(e) { if (e.target === el) el.classList.remove('open'); });
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(function(m){ m.classList.remove('open'); });
});

/* ===== TOAST ===== */
function toast(msg, type) {
    type = type || 'success';
    var wrap = document.getElementById('toastWrap');
    var el   = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span class="t-icon">' + (type==='success'?'✅':'❌') + '</span><span class="t-msg">' + msg + '</span>';
    wrap.appendChild(el);
    setTimeout(function(){ el.classList.add('out'); setTimeout(function(){ el.remove(); }, 300); }, 3000);
}

/* ===== COPY STK ===== */
function copySTK() {
    navigator.clipboard.writeText('48210000777811').then(function() {
        toast('Đã copy số tài khoản!', 'success');
    });
}

/* ===== AUTO THEME — theo giờ Việt Nam (UTC+7) ===== */
// 06:00 → 17:59 = sáng, 18:00 → 05:59 = tối.
// Tự cập nhật mỗi phút nên khi qua ngưỡng 6h/18h sẽ tự đổi mà không cần reload.
function applyTimeTheme() {
    var h;
    try {
        h = parseInt(new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh'
        }).format(new Date()), 10);
    } catch (_) {
        // Fallback nếu trình duyệt cũ không hỗ trợ timeZone
        var d = new Date();
        var utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
        h = Math.floor(((utcMin + 7 * 60) % (24 * 60)) / 60);
    }
    var theme = (h >= 6 && h < 18) ? 'light' : 'dark';
    if (document.documentElement.getAttribute('data-theme') !== theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }
}
applyTimeTheme();
setInterval(applyTimeTheme, 60 * 1000);

/* ===== BODY SCROLL LOCK (when any modal/viewer is open) ===== */
(function () {
    function sync() {
        var open = document.querySelector('.overlay.open, .image-viewer.open');
        document.body.classList.toggle('no-scroll', !!open);
    }
    var mo = new MutationObserver(sync);
    document.querySelectorAll('.overlay, .image-viewer').forEach(function (el) {
        mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
})();

/* ===== INIT ===== */
loadWorkspaces();
