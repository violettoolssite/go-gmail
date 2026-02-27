// 谷歌邮箱号码工具
// 豪猪网 API：https://api.haozhuma.com/sms/

const API_BASE = 'https://api.haozhuma.com/sms/';
const SID = '28209';

// API 配置
let apiUser = localStorage.getItem('hz_api_user') || '';
let apiPass = localStorage.getItem('hz_api_pass') || '';
let apiCode = localStorage.getItem('hz_api_code') || '';

let state = {
    token: null,
    phone: null,
    pinnedEmail: null,
    pollTimer: null,
    isPolling: false,
    smsHistory: [],   // 保存所有收到过的短信内容 {time, content, code}
    pinnedList: [],   // 保存历史绑定号码 {phone, email}
};

// ===================== 本地存储 =====================
function saveState() {
    localStorage.setItem('hz_token', state.token || '');
    localStorage.setItem('hz_phone', state.phone || '');
    localStorage.setItem('hz_email', state.pinnedEmail || '');
    localStorage.setItem('hz_smsHistory', JSON.stringify(state.smsHistory));
    localStorage.setItem('hz_pinnedList', JSON.stringify(state.pinnedList));
}

function loadState() {
    state.token = localStorage.getItem('hz_token') || null;
    state.phone = localStorage.getItem('hz_phone') || null;
    state.pinnedEmail = localStorage.getItem('hz_email') || null;
    try {
        state.smsHistory = JSON.parse(localStorage.getItem('hz_smsHistory') || '[]');
        // 自动清理掉历史记录里不小心存入的报错文本
        state.smsHistory = state.smsHistory.filter(sms =>
            !sms.content.includes('没有获取该号码') &&
            !sms.content.includes('无法读取短信') &&
            !sms.content.includes('未获取')
        );
    } catch { state.smsHistory = []; }
    try { state.pinnedList = JSON.parse(localStorage.getItem('hz_pinnedList') || '[]'); } catch { state.pinnedList = []; }

    // 自动清理意外存入的无效数据 (null)
    state.pinnedList = state.pinnedList.filter(p => p && p.phone && p.phone !== 'null');
    const hasSpecial = state.pinnedList.some(p => p.phone === '17329396205');
    if (!hasSpecial) {
        state.pinnedList.push({ phone: '17329396205', email: '历史账号（自动添加）' });
        saveState();
    }
}

// ===================== API 请求 =====================
async function apiCall(params) {
    const url = API_BASE + '?' + new URLSearchParams(params).toString();
    try {
        const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!resp.ok) return { code: -1, msg: 'HTTP ' + resp.status, httpStatus: resp.status };
        const text = await resp.text();
        try { return JSON.parse(text); } catch (e) { return { code: -1, msg: text }; }
    } catch (e) { return { code: -1, msg: '网络错误：' + e.message }; }
}

async function apiLogin() { return await apiCall({ api: 'login', user: apiUser, pass: apiPass }); }
async function apiGetUserInfo() { return await apiCall({ api: 'getSummary', token: state.token }); }
// 获取号码（如果是特定号码，传入 phoneParam）
async function apiGetPhone(phoneParam = null) {
    const params = { api: 'getPhone', author: apiCode, token: state.token, sid: SID, mobile: 1 };
    if (phoneParam) params.phone = phoneParam;
    return await apiCall(params);
}
async function apiGetSms(phone) { return await apiCall({ api: 'getMessage', author: apiCode, token: state.token, sid: SID, phone }); }
async function apiCancelPhone(phone) { return await apiCall({ api: 'cancelPhone', token: state.token, phone, sid: SID }); }
async function apiCancelAll() { return await apiCall({ api: 'cancelAllRecv', token: state.token }); }
async function apiBlackPhone(phone) { return await apiCall({ api: 'blackPhone', token: state.token, phone, sid: SID }); }

// ===================== UI 工具 =====================
function setStatus(msg, type = 'info', autoHide = true) {
    const el = document.getElementById('status-bar');
    el.textContent = msg;
    el.className = 'status-top show ' + type;
    if (autoHide && type !== 'error') {
        setTimeout(() => { if (el.textContent === msg) el.classList.remove('show'); }, 3000);
    }
}

function renderUI() {
    const phoneEl = document.getElementById('phone-display');
    const bindDisplay = document.getElementById('pinned-email-display');
    const btnGet = document.getElementById('btn-get-phone');
    const balanceWrap = document.getElementById('balance-wrap');

    // 显示余额
    if (state.token && state.balance !== undefined) {
        balanceWrap.style.display = 'flex';
        document.getElementById('user-balance').textContent = state.balance;
    } else {
        balanceWrap.style.display = 'none';
    }

    // 号码区
    if (state.phone) {
        phoneEl.textContent = state.phone;
        btnGet.textContent = '换新号码';
        // 绑定邮箱显示
        if (state.pinnedEmail) {
            bindDisplay.textContent = state.pinnedEmail;
            bindDisplay.style.color = 'var(--text-main)';
        } else {
            bindDisplay.textContent = '未绑定';
            bindDisplay.style.color = 'var(--text-light)';
        }
    } else {
        phoneEl.textContent = '---';
        btnGet.textContent = '获取新号码';
    }
    btnGet.disabled = !state.token;

    // 短信区
    renderSms();

    // 历史绑定区
    renderPinnedList();
}

function renderSms() {
    const list = document.getElementById('sms-list');

    // 逻辑调整：如果有正在使用的号码，只看该号的；如果没有号码，看全部记录。
    const displayList = state.phone
        ? state.smsHistory.filter(sms => !sms.targetPhone || sms.targetPhone === state.phone)
        : state.smsHistory;

    if (displayList.length === 0) {
        list.innerHTML = `<div class="empty-state">${state.phone ? '该号码暂无验证码，等待接收...' : '暂无短信记录'}</div>`;
        return;
    }

    // 倒序显示（最新的在最上面）
    const html = [...displayList].reverse().map(sms => `
        <div class="sms-bubble">
            <div class="sms-head">
                <span style="font-weight:600;">${sms.targetPhone || '历史记录'}</span>
                <span>${sms.time}</span>
            </div>
            ${sms.code ? `<div class="sms-code" title="点击复制" onclick="copySmsCode('${sms.code}')">${sms.code}</div>` : ''}
            <div class="sms-text">${escapeHtml(sms.content)}</div>
        </div>
    `).join('');
    list.innerHTML = html;
}

function renderPinnedList() {
    const list = document.getElementById('pinned-list');
    if (!state.pinnedList || state.pinnedList.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:20px 0;">无历史绑定号码</div>';
        return;
    }
    list.innerHTML = state.pinnedList.map((item, idx) => `
        <div class="history-item">
            <div class="h-info">
                <span class="h-phone">${escapeHtml(item.phone)}</span>
                <span class="h-email">${escapeHtml(item.email || '未绑定邮箱')}</span>
            </div>
            <div class="h-actions">
                <button class="btn-text small" onclick="loadPinnedNumber(${idx})">载入</button>
                <button class="btn-text small" onclick="editPinnedNumber(${idx})" style="color:var(--primary);">修改</button>
                <button class="btn-text danger small" onclick="removePinnedNumber(${idx})">删除</button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 轮询动画状态
function updatePollIndicator(active) {
    const el = document.getElementById('poll-indicator');
    state.isPolling = active;
    if (active) {
        el.classList.add('active');
        el.innerHTML = '<span class="dot"></span> 接收中';
    } else {
        el.classList.remove('active');
        el.innerHTML = '';
    }
}

// ===================== 核心业务 =====================
function startPoll() {
    stopPoll();
    if (!state.phone) return;
    refreshSms();
    state.pollTimer = setInterval(refreshSms, 5000);
    updatePollIndicator(true);
}

function stopPoll() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
    updatePollIndicator(false);
}

async function loadUserInfo() {
    if (!state.token) return;
    const r = await apiGetUserInfo();
    if (r.code === 0 || r.code === '0' || r.code === 200) {
        state.balance = r.money || r.balance || r.coin || '0.00';
        renderUI();
    }
}

async function refreshSms() {
    if (!state.phone || !state.token) return;
    const r = await apiGetSms(state.phone);
    if (r.code === '0' || r.code === 0 || r.msg === 'success') {
        const rawContent = r.sms || r.yzm || '';
        // 防止重复添加同一条短信（检查该号码的历史记录中是否已存在完全相同的内容）
        const isDuplicate = state.smsHistory.some(sms =>
            sms.targetPhone === state.phone && sms.content === rawContent
        );

        if (!isDuplicate && rawContent) {
            // 过滤：有时候服务器会把错误信息放进 sms 字段下返回 code 0
            const lowerContent = rawContent.toLowerCase();
            const isErrorMsg = lowerContent.includes('没有获取该号码') ||
                lowerContent.includes('无法读取短信') ||
                lowerContent.includes('未获取') ||
                lowerContent.includes('没有权限') ||
                lowerContent.includes('不存在');

            if (isErrorMsg) {
                stopPoll();
                return;
            }

            const codeMatch = rawContent.match(/\b(\d{4,8})\b/);
            const smsObj = {
                targetPhone: state.phone, // 记录这条短信归属哪个号码
                time: new Date().toLocaleTimeString(),
                content: rawContent,
                code: codeMatch ? codeMatch[1] : ''
            };
            state.smsHistory.push(smsObj);
            saveState();
            renderSms();
            setStatus('收到新短信！', 'success');
        }
    } else if (r.msg && (r.msg.includes('没有获取该号码') || r.msg.includes('未获取'))) {
        // 如果服务器提示没获取该号码，停止轮询，避免死循环（但不弹窗报错打扰用户）
        stopPoll();
    }
}

// ===================== 事件处理 =====================

// 获取新号码
document.getElementById('btn-get-phone').addEventListener('click', async () => {
    stopPoll();
    setStatus('清理后台挂载号码...', 'info', false);

    // 强制释放该账号名下所有的号码（包括其他设备获取或未清理的）
    await apiCancelAll();

    document.getElementById('btn-get-phone').disabled = true;
    document.getElementById('phone-display').textContent = '获取中...';
    setStatus('正在请求新号码...', 'info', false);

    const r = await apiGetPhone();
    document.getElementById('btn-get-phone').disabled = false;

    if (r.code === 1 || r.code === 200 || r.phone) {
        state.phone = r.phone || r.data?.phone;
        state.pinnedEmail = null; // 重置绑定
        // 取消这行代码，让短信记录永存
        // state.smsHistory = [];    // 清空旧历史
        saveState();
        renderUI();
        startPoll();
        setStatus('获取成功，请绑定谷歌邮箱', 'success');

        // 获取号码后直接弹出绑定邮筱框
        modalTargetPhone = state.phone; // 修复：自动弹出时也需要设置目标号码
        document.getElementById('pin-modal').style.display = 'flex';
        document.getElementById('modal-phone-display').textContent = state.phone;
        document.getElementById('modal-email-input').value = '';
        setTimeout(() => document.getElementById('modal-email-input').focus(), 50);
    } else {
        state.phone = null;
        renderUI();
        setStatus('获取号码失败：' + (r.msg || '未知错误'), 'error');
    }
});

// 拉黑号码
document.getElementById('btn-black').addEventListener('click', async () => {
    if (!state.phone) return;
    if (!confirm('确认拉黑当前号码？拉黑后不再分配此号。')) return;
    stopPoll();
    setStatus('拉黑中...', 'info', false);
    await apiBlackPhone(state.phone);
    state.phone = null;
    state.pinnedEmail = null;
    saveState();
    renderUI();
    setStatus('号码已拉黑', 'info');
});

// 绑定相关
let modalTargetPhone = null;

document.getElementById('btn-pin').addEventListener('click', () => {
    if (!state.phone) return;
    modalTargetPhone = state.phone;
    document.getElementById('pin-modal').style.display = 'flex';
    document.getElementById('modal-phone-display').textContent = state.phone;

    // 如果已有绑定，只显示前缀
    const currentEmail = state.pinnedEmail || '';
    document.getElementById('modal-email-input').value = currentEmail.replace('@gmail.com', '');
    document.getElementById('modal-email-input').focus();
});

window.editPinnedNumber = function (idx) {
    const item = state.pinnedList[idx];
    if (!item) return;
    modalTargetPhone = item.phone;
    document.getElementById('pin-modal').style.display = 'flex';
    document.getElementById('modal-phone-display').textContent = item.phone;

    const currentEmail = item.email || '';
    document.getElementById('modal-email-input').value = currentEmail.replace('@gmail.com', '');
    document.getElementById('modal-email-input').focus();
};

document.getElementById('btn-modal-confirm').addEventListener('click', () => {
    const prefix = document.getElementById('modal-email-input').value.trim();
    if (!prefix) {
        document.getElementById('modal-email-input').style.borderColor = 'var(--danger)';
        return;
    }

    if (!modalTargetPhone) {
        setStatus('操作异常：未识别到目标号码', 'error');
        document.getElementById('pin-modal').style.display = 'none';
        return;
    }

    // 自动补全 @gmail.com
    const fullEmail = prefix.includes('@') ? prefix : prefix + '@gmail.com';

    // 如果操作的是当前页面的号码
    if (modalTargetPhone === state.phone) {
        state.pinnedEmail = fullEmail;
    }

    // 更新或添加到历史列表
    const existIdx = state.pinnedList.findIndex(p => p.phone === modalTargetPhone);
    if (existIdx >= 0) {
        state.pinnedList[existIdx].email = fullEmail;
    } else {
        state.pinnedList.unshift({ phone: modalTargetPhone, email: fullEmail });
    }

    saveState();
    document.getElementById('pin-modal').style.display = 'none';
    renderUI();
    setStatus('保存成功', 'success');
});

document.getElementById('btn-modal-cancel').addEventListener('click', () => {
    document.getElementById('pin-modal').style.display = 'none';
});

// 复制短信验证码
// 复制号码
document.getElementById('btn-copy').addEventListener('click', () => {
    if (!state.phone) return;
    navigator.clipboard.writeText(state.phone).then(() => {
        setStatus('号码已复制', 'success');
    }).catch(() => setStatus('浏览器不支持复制', 'error'));
});

// 复制短信验证码
window.copySmsCode = function (code) {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
        setStatus('验证码已复制：' + code, 'success');
    }).catch(() => setStatus('浏览器不支持复制', 'error'));
};

// ===================== API 配置模态框 =====================
document.getElementById('btn-settings').addEventListener('click', () => {
    // 隐藏可能冲突的其它模态框
    const reloadModal = document.getElementById('reload-modal');
    if (reloadModal) reloadModal.style.display = 'none';

    document.getElementById('settings-modal').style.display = 'flex';
    document.getElementById('set-api-user').value = apiUser;
    document.getElementById('set-api-pass').value = apiPass;
    document.getElementById('set-api-code').value = apiCode;
});

document.getElementById('btn-set-confirm').addEventListener('click', () => {
    apiUser = document.getElementById('set-api-user').value.trim();
    apiPass = document.getElementById('set-api-pass').value.trim();
    apiCode = document.getElementById('set-api-code').value.trim();

    if (!apiUser || !apiPass || !apiCode) {
        setStatus('各项配置均不能为空', 'error');
        return;
    }

    localStorage.setItem('hz_api_user', apiUser);
    localStorage.setItem('hz_api_pass', apiPass);
    localStorage.setItem('hz_api_code', apiCode);

    document.getElementById('settings-modal').style.display = 'none';
    setStatus('配置已保存，请重新获取号码以生效', 'success');
});

document.getElementById('btn-set-cancel').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'none';
});

// 载入历史号码
window.loadPinnedNumber = async function (idx) {
    const target = state.pinnedList[idx];
    if (!target) return;

    stopPoll();
    setStatus('清理后台挂载号码...', 'info', false);

    // 强制释放该账号名下所有的号码（避免被占满或干扰）
    await apiCancelAll();

    setStatus(`正在向平台请求找回号码 ${target.phone} ...`, 'info', false);

    // 向平台请求再次获取这个特定号码
    const r = await apiGetPhone(target.phone);

    if (r.code === 1 || r.code === 200 || r.phone) {
        // 成功获取回来了
        state.phone = target.phone; // 修复：必须更新当前号码状态
        state.pinnedEmail = target.email;
        // 取消移除旧记录：state.smsHistory = [];
        saveState();
        renderUI();
        startPoll();
        setStatus(`找回成功，正在监听号码：${target.phone}`, 'success');
    } else {
        // 获取失败了，往往是因为号码已被别人占用或失效
        setStatus(`找回失败：${r.msg || '平台已无该号'}`, 'error');
    }
};

// 删除历史号码
window.removePinnedNumber = function (idx) {
    if (!confirm('确定删除该历史记录吗？')) return;
    state.pinnedList.splice(idx, 1);
    saveState();
    renderUI();
};

// ===================== 初始化 =====================
async function init() {
    loadState();

    // 检查是否没配置
    if (!apiUser || !apiPass) {
        // 弹出要求配置
        renderUI();
        document.getElementById('btn-settings').click();
        setStatus('初次使用请先配置API凭证', 'info', false);
        return;
    }

    renderUI();

    if (state.token) {
        setStatus('已连接平台', 'success');
        loadUserInfo();

        // 如果有遗留的号码，询问是否重新获取
        if (state.phone) {
            document.getElementById('reload-modal').style.display = 'flex';
            document.getElementById('reload-phone-display').textContent = state.phone;
        }
        return;
    }

    // 自动登录
    setStatus('连接到接码平台...', 'info', false);
    const r = await apiLogin();
    if (r.code === 1 || r.code === 200 || r.token) {
        state.token = r.token || r.data?.token;
        saveState();
        renderUI();
        loadUserInfo();

        // 自动登录后如果有遗留的号码，询问是否重新获取
        if (state.phone) {
            document.getElementById('reload-modal').style.display = 'flex';
            document.getElementById('reload-phone-display').textContent = state.phone;
        }

        setStatus('连接成功', 'success');
    } else {
        setStatus('连接平台失败，请检查API配置', 'error');
    }
}

// 刷新重新获取面板逻辑
document.getElementById('btn-reload-confirm').addEventListener('click', async () => {
    document.getElementById('reload-modal').style.display = 'none';
    const num = state.phone;
    if (!num) return;

    stopPoll();
    setStatus('清理后台挂载号码...', 'info', false);
    await apiCancelAll();

    setStatus(`正在向平台请求找回号码 ${num} ...`, 'info', false);
    const r = await apiGetPhone(num);

    if (r.code === 1 || r.code === 200 || r.phone) {
        state.phone = num;
        saveState();
        renderUI();
        startPoll();
        setStatus(`已重新获取并监听号码：${num}`, 'success');
    } else {
        setStatus(`重新获取失败：${r.msg || '平台已无该号'}`, 'error');
        state.phone = null;
        state.pinnedEmail = null;
        saveState();
        renderUI();
    }
});

document.getElementById('btn-reload-cancel').addEventListener('click', async () => {
    document.getElementById('reload-modal').style.display = 'none';
    const num = state.phone;
    if (num && state.token) {
        setStatus('正在释放未完成的号码...', 'info', false);
        await apiCancelPhone(num);
    }
    state.phone = null;
    state.pinnedEmail = null;
    stopPoll();
    saveState();
    renderUI();
    setStatus('已释放', 'success');
});

init();
