// Initialize database from config
const db = IS_CONFIGURED
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!IS_CONFIGURED) {
    document.getElementById('configBanner').style.display = 'flex';
    document.getElementById('tbody').innerHTML = '<tr><td colspan="7"><div class="state-box"><div class="icon">⚙️</div><h3>Chưa cấu hình Supabase</h3><p>Xem hướng dẫn ở banner phía trên</p></div></td></tr>';
}

var rows    = [];
var delId   = null;
var isAdmin = false;
var currentDetailId = null;
var selectedImageFile = null;
var removeImageFlag = false;

/* ===== AUTH STATE ===== */
function setAdminUI(loggedIn) {
    isAdmin = loggedIn;
    document.getElementById('adminControls').style.display = loggedIn ? 'flex' : 'none';
    document.getElementById('btnLogin').style.display      = loggedIn ? 'none' : 'flex';
    var btnQr = document.querySelector('.btn-qr');
    var qrLbl = btnQr.querySelector('.lbl');
    if (loggedIn) {
        btnQr.classList.add('icon-only');
        qrLbl.style.display = 'none';
    } else {
        btnQr.classList.remove('icon-only');
        qrLbl.style.display = '';
    }
    document.querySelector('table').classList.toggle('admin-mode', loggedIn);
    render();
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
    return new Intl.NumberFormat('vi-VN').format(n) + '\u00a0đ';
}
function moneyFull(n) {
    return new Intl.NumberFormat('vi-VN').format(n || 0) + '\u00a0đ';
}
function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}
function today() { return new Date().toISOString().split('T')[0]; }
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ===== LOAD ===== */
async function load() {
    if (!IS_CONFIGURED) return;
    var { data, error } = await db
        .from('transactions')
        .select('*')
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
    document.getElementById('recCount').textContent = rows.length + ' giao dịch';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="state-box"><div class="icon">📭</div><h3>Chưa có giao dịch nào</h3><p>Nhấn "Thêm giao dịch" để bắt đầu</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function(t, i) {
        var vao = t.tien_vao || 0;
        var ra  = t.tien_ra  || 0;
        var bal = t.tongConLai || 0;
        var vaoCell = vao > 0 ? '<td class="money-in">+' + money(vao) + '</td>' : '<td class="money-dash">—</td>';
        var raCell  = ra  > 0 ? '<td class="money-out">−' + money(ra)  + '</td>' : '<td class="money-dash">—</td>';
        return '<tr onclick="openDetail(' + t.id + ')" style="cursor:pointer">'
            + '<td class="stt">' + (i+1) + '</td>'
            + '<td><span class="date-badge">' + fmtDate(t.ngay) + '</span></td>'
            + vaoCell + raCell
            + '<td class="noidung">' + (t.noi_dung ? escHtml(t.noi_dung) : '<span style="color:#cbd5e0">—</span>') + '</td>'
            + '<td><span class="bal ' + (bal >= 0 ? 'pos' : 'neg') + '">' + moneyFull(bal) + '</span></td>'
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
    document.getElementById('modalTitle').textContent = '➕ Thêm giao dịch';
    document.getElementById('fId').value      = '';
    document.getElementById('fNgay').value    = today();
    document.getElementById('fVao').value     = '';
    document.getElementById('fRa').value      = '';
    document.getElementById('fNoidung').value = '';
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
    // Disable field còn lại nếu đã có giá trị
    if (t.tien_vao > 0) { document.getElementById('fRa').disabled = true;  document.getElementById('fRa').style.opacity  = '0.35'; }
    if (t.tien_ra  > 0) { document.getElementById('fVao').disabled = true; document.getElementById('fVao').style.opacity = '0.35'; }
    document.getElementById('fNoidung').value = t.noi_dung || '';
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
async function save() {
    var id      = document.getElementById('fId').value;
    var ngay    = document.getElementById('fNgay').value;
    var vao     = document.getElementById('fVao').value;
    var ra      = document.getElementById('fRa').value;
    var noidung = document.getElementById('fNoidung').value.trim();

    if (!ngay)      { toast('Vui lòng chọn ngày!', 'error'); return; }
    var year = parseInt(ngay.split('-')[0]);
    if (isNaN(year) || year < 2000 || year > 2099) { toast('Năm không hợp lệ! Chỉ nhập 4 chữ số (2000–2099).', 'error'); document.getElementById('fNgay').focus(); return; }
    if (!vao && !ra){ toast('Vui lòng nhập tiền vào hoặc tiền ra!', 'error'); return; }

    var payload = {
        ngay:     ngay,
        tien_vao: vao ? parseFloat(vao) : 0,
        tien_ra:  ra  ? parseFloat(ra)  : 0,
        noi_dung: noidung || null
    };

    // Handle image upload
    if (selectedImageFile) {
        try {
            var fileName = 'transaction_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            var upsert = !id; // Use upsert for new files
            
            var uploadRes = await db.storage
                .from('transaction-images')
                .upload(fileName, selectedImageFile, { upsert: upsert });
            
            if (uploadRes.error) {
                console.error('Upload error:', uploadRes.error);
                toast('Lỗi upload ảnh: ' + uploadRes.error.message, 'error');
                return;
            }
            
            // Get public URL
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
            var res = await db.from('transactions').update(payload).eq('id', id);
            error = res.error;
        } else {
            var res = await db.from('transactions').insert(payload);
            error = res.error;
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
    
    // Set values
    document.getElementById('detailNgay').textContent = fmtDate(t.ngay);
    document.getElementById('detailVao').textContent = (t.tien_vao > 0) ? '+' + moneyFull(t.tien_vao) : '—';
    document.getElementById('detailRa').textContent = (t.tien_ra > 0) ? '−' + moneyFull(t.tien_ra) : '—';
    document.getElementById('detailNoidung').textContent = t.noi_dung || '—';
    
    var bal = t.tongConLai || 0;
    var balEl = document.getElementById('detailBal');
    balEl.textContent = moneyFull(bal);
    balEl.className = bal >= 0 ? 'stat-value blue' : 'stat-value danger';
    
    // Show/hide image
    if (t.anh_url) {
        var detailImg = document.getElementById('detailImage');
        detailImg.src = t.anh_url;
        detailImg.style.cursor = 'pointer';
        detailImg.onclick = function() { openImageViewer(t.anh_url); };
        document.getElementById('detailImageBox').style.display = 'block';
    } else {
        document.getElementById('detailImageBox').style.display = 'none';
    }
    
    // Show edit/delete buttons only for admin
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

/* ===== INIT ===== */
load();
