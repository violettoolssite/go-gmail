import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { api } from './services/api';
import { Settings, Copy, Trash2, Download, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [apiUser, setApiUser] = useLocalStorage('hz_api_user', '');
  const [apiPass, setApiPass] = useLocalStorage('hz_api_pass', '');
  const [apiCode, setApiCode] = useLocalStorage('hz_api_code', '');

  const [token, setToken] = useLocalStorage('hz_token', null);
  const [phone, setPhone] = useLocalStorage('hz_phone', null);
  const [pinnedEmail, setPinnedEmail] = useLocalStorage('hz_email', null);
  const [smsHistory, setSmsHistory] = useLocalStorage('hz_smsHistory', []);
  const [pinnedList, setPinnedList] = useLocalStorage('hz_pinnedList', []);

  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState({ show: false, msg: '', type: 'info' });
  const [isPolling, setIsPolling] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showGetModal, setShowGetModal] = useState(false);
  const [showReloadModal, setShowReloadModal] = useState(false);
  const [modalTargetPhone, setModalTargetPhone] = useState('');
  const [designatedPhone, setDesignatedPhone] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const [tmpUser, setTmpUser] = useState('');
  const [tmpPass, setTmpPass] = useState('');
  const [tmpCode, setTmpCode] = useState('');

  const pollTimerRef = useRef(null);

  const notify = useCallback((msg, type = 'info', autoHide = true) => {
    setStatus({ show: true, msg, type });
    if (autoHide && type !== 'error') {
      setTimeout(() => {
        setStatus(s => s.msg === msg ? { ...s, show: false } : s);
      }, 3000);
    }
  }, []);

  const stopPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPoll = useCallback(() => {
    if (pollTimerRef.current) return;
    setIsPolling(true);
    pollTimerRef.current = setInterval(async () => {
      if (!token || !phone) {
        stopPoll();
        return;
      }
      const r = await api.getSms(token, apiCode, phone);
      if (r.code === 1 || r.code === 200 || r.data?.length > 0) {
        const list = Array.isArray(r.data) ? r.data : (r.sms ? [r] : []);
        if (list.length > 0) {
          stopPoll();
          const smsText = list[0].sms || list[0].content || JSON.stringify(list[0]);
          const codeMatch = smsText.match(/\d{4,6}/);
          const vcode = codeMatch ? codeMatch[0] : null;

          setSmsHistory(prev => {
            const isDup = prev.some(s => s.targetPhone === phone && s.content === smsText);
            if (isDup) return prev;
            return [{
              id: Date.now(),
              time: new Date().toLocaleTimeString(),
              content: smsText,
              code: vcode,
              targetPhone: phone
            }, ...prev];
          });
          notify('收到新短信！可以点击验证码复制', 'success');
        }
      } else if (r.msg && (r.msg.includes('没有获取该号码') || r.msg.includes('未获取'))) {
        stopPoll();
      }
    }, 4000);
  }, [token, phone, apiCode, setSmsHistory, stopPoll, notify]);

  const updateBalance = useCallback(async (currentToken) => {
    const r = await api.getUserInfo(currentToken);
    if (r.code === 0 || r.code === 1 || r.msg === 'success') {
      setBalance(r.balance || r.money || r.data?.balance || '0.00');
    }
  }, []);

  const initLogin = useCallback(async () => {
    if (!apiUser || !apiPass || !apiCode) {
      notify('未配置 API 信息，请点击左上角配置', 'error', false);
      return;
    }
    notify('正在登录...');
    const r = await api.login(apiUser, apiPass);
    if (r.code === 0 || r.code === 1 || r.token) {
      const newToken = r.token || r.data?.token;
      setToken(newToken);
      notify('登录成功，已连接到平台', 'success');
      updateBalance(newToken);

      if (phone) {
        setShowReloadModal(true);
      }
    } else {
      setToken(null);
      notify(`登录失败：${r.msg || '凭证错误'}`, 'error', false);
    }
  }, [apiUser, apiPass, apiCode, phone, setToken, notify, updateBalance]);

  useEffect(() => {
    // 紧急补丁：专门修正号码 19247214934 的对接码
    setPinnedList(lst => {
      let changed = false;
      const next = [...lst];
      const targetItem = next.find(p => p.phone === '19247214934');
      if (targetItem && targetItem.apiCode !== '28209-UL0ASMBCCA') {
        targetItem.apiCode = '28209-UL0ASMBCCA';
        changed = true;
      }
      return changed ? next : lst;
    });

    initLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run on mount

  useEffect(() => {
    if (phone) {
      startPoll();
    } else {
      stopPoll();
    }
    return () => stopPoll();
  }, [phone, startPoll, stopPoll]);

  const openSettings = () => {
    setTmpUser(apiUser);
    setTmpPass(apiPass);
    setTmpCode(apiCode);
    setShowSettings(true);
  };

  const saveSettings = () => {
    setApiUser(tmpUser.trim());
    setApiPass(tmpPass.trim());
    setApiCode(tmpCode.trim());
    setShowSettings(false);
    // login will be triggered manually or needs refresh, let's auto-init
    setTimeout(() => window.location.reload(), 100);
  };

  const handleGetPhone = async () => {
    if (!token) return notify('请先完成 API 配置并登录', 'error');
    setShowGetModal(false);
    stopPoll();
    notify('清理后台挂载号码...', 'info', false);
    await api.cancelAll(token);

    notify(designatedPhone ? `正在请求指定号码 ${designatedPhone}...` : '正在请求新号码...', 'info', false);

    // Disable btn logic handled via state if needed, here just awaiting
    const r = await api.getPhone(token, apiCode, designatedPhone || null);
    if (r.code === 1 || r.code === 200 || r.phone || r.data?.phone) {
      const newPhone = r.phone || r.data?.phone || r.mobile || r.number;
      setPhone(newPhone);
      setPinnedEmail(null);
      notify(designatedPhone ? `已成功获取指定号码：${newPhone}` : '获取成功，请绑定谷歌邮箱', 'success');
      updateBalance(token);

      setModalTargetPhone(newPhone);
      setEmailInput('');
      setShowPinModal(true);
    } else {
      setPhone(null);
      notify(`获取号码失败：${r.msg || '未知错误'}`, 'error');
    }
  };

  const renderHistorySms = () => {
    const list = phone ? smsHistory.filter(s => s.targetPhone === phone) : smsHistory;
    if (list.length === 0) return <div className="empty-state">暂无相关短信记录...</div>;
    return list.map(sms => (
      <div key={sms.id} className="sms-bubble">
        <div className="sms-head">
          <span className="sms-time">{sms.time}</span>
          {!phone && <span className="sms-sender">{sms.targetPhone || '历史记录'}</span>}
        </div>
        {sms.code && (
          <div className="sms-code" onClick={() => copyToClipboard(sms.code)} title="点击复制验证码">
            💬 {sms.code}
          </div>
        )}
        <div className="sms-text">{sms.content}</div>
      </div>
    ));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => notify('已复制: ' + text, 'success'));
  };

  const cancelCurrent = async () => {
    if (phone) {
      await api.cancelPhone(token, phone);
      notify(`号码 ${phone} 已释放`, 'success');
      setPhone(null);
      setPinnedEmail(null);
    }
  };

  const blackCurrent = async () => {
    if (phone && window.confirm('加入黑名单后将不再获取此号码，并立即释放该号码，是否继续？')) {
      await api.blackPhone(token, phone);
      notify(`号码 ${phone} 已拉黑并释放`, 'success');
      setPhone(null);
      setPinnedEmail(null);
    }
  };

  const exportSettings = () => {
    const dataStr = JSON.stringify(pinnedList, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `接码历史备份_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    a.click();
  };

  const importSettings = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          // Merge avoiding duplicates by phone
          setPinnedList(prev => {
            const merged = [...prev];
            data.forEach(item => {
              if (item && item.phone && !merged.find(p => p.phone === item.phone)) {
                merged.push({
                  phone: item.phone,
                  email: item.email || '未知账号',
                  apiCode: item.apiCode || '旧版导入'
                });
              }
            });
            return merged;
          });
          notify('数据导入成功！', 'success');
        } else {
          notify('导入失败：文件格式不规范', 'error');
        }
      } catch (err) {
        notify('导入失败：文件解析错误', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = null; // reset input
  };

  return (
    <div className="app">
      {/* 顶部控制栏 */}
      <div className="top-nav">
        <button className="btn-icon-text" onClick={openSettings} title="API 设置">配置</button>
        <div className={`status-top ${status.show ? 'show' : ''} ${status.type}`}>
          {status.msg}
        </div>
        {balance !== null && (
          <div className="balance-display" style={{ display: 'flex' }}>
            <span className="balance-label">余额:</span>
            <span className="balance-val">{balance}</span>
          </div>
        )}
      </div>

      {/* 核心展示区 */}
      <div className="main-card">
        <div className="card-header">
          <span>当前可用号码</span>
          <button className="btn-text" onClick={() => setShowGetModal(true)} disabled={!token}>
            获取新号码
          </button>
        </div>

        <div className="phone-hero">
          <span className="the-number">{phone || '---'}</span>
          <div className="phone-hero-actions">
            <span className="price-tag">3.3元/次</span>
            {phone && (
              <button className="btn-icon-text" onClick={() => copyToClipboard(phone)} title="复制号码">复制</button>
            )}
          </div>
        </div>

        {phone && (
          <div className="phone-meta" style={{ display: 'flex' }}>
            <div className="meta-bind">
              <span className="bind-label">绑定邮箱:</span>
              <span className="bind-value">{pinnedEmail || '未绑定'}</span>
              <button className="btn-text small" onClick={() => {
                setModalTargetPhone(phone);
                setEmailInput('');
                setShowPinModal(true);
              }}>修改</button>
            </div>
            <div className="meta-actions">
              <button className="btn-text small" onClick={cancelCurrent}>释放号码</button>
              <button className="btn-text danger small" onClick={blackCurrent}>拉黑号码</button>
            </div>
          </div>
        )}
      </div>

      {/* 短信区 */}
      <div className="sms-section">
        <div className="section-header">
          <h3>短信记录</h3>
          {isPolling && (
            <div className="poll-anim active">
              <span className="dot"></span> 接收中
            </div>
          )}
        </div>
        <div className="sms-list">{renderHistorySms()}</div>
      </div>

      {/* 历史记录 */}
      <div className="history-section">
        <div className="section-header">
          <h3>历史已绑号码</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label className="btn-text" style={{ cursor: 'pointer' }}>
              导入备份
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={importSettings} />
            </label>
            <button className="btn-text" onClick={exportSettings}>导出备份</button>
          </div>
        </div>
        <div className="pinned-list">
          {pinnedList.length === 0 ? (
            <div className="empty-state">暂无历史绑定记录</div>
          ) : ( // @更新：显示对接码
            pinnedList.map((p, idx) => (
              <div key={idx} className="history-item">
                <div className="h-info">
                  <span className="h-phone">{p.phone}</span>
                  <span className="h-email">{p.email || '未绑定'}</span>
                  <span className="pinned-code" style={{ fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                    对接码: {p.apiCode || '未知'}
                  </span>
                </div>
                <div className="h-actions">
                  <button className="btn-text small" onClick={() => {
                    setModalTargetPhone(p.phone);
                    setEmailInput(p.email);
                    setShowPinModal(true);
                  }}>修改</button>
                  <button className="btn-text danger small" onClick={() => {
                    if (window.confirm(`确定要从历史记录中删除号码 ${p.phone} 吗？\n注意：这不会在平台上拉黑该号码，仅删除本地记录。`)) {
                      setPinnedList(prev => prev.filter(item => item.phone !== p.phone));
                    }
                  }}>删除</button>
                  <button className="btn-text small" onClick={async () => {
                    if (!token) return notify('请先完成 API 配置并登录', 'error');
                    stopPoll();
                    notify(`正在验证号码 ${p.phone} 的有效性...`, 'info', false);
                    document.body.style.cursor = 'wait';

                    // 确定要使用的对接码
                    const targetCode = p.apiCode && p.apiCode !== '未知' && p.apiCode !== '旧版导入' ? p.apiCode : apiCode;

                    // 先强制清理该账号名下可能挂载的其他号，再尝试获取此指定旧号
                    await api.cancelAll(token);
                    const r = await api.getPhone(token, targetCode, p.phone);

                    document.body.style.cursor = 'default';
                    if (r.code === 1 || r.code === 200 || r.phone || r.data?.phone) {
                      setPhone(p.phone);
                      setPinnedEmail(p.email);
                      if (targetCode !== apiCode) {
                        setApiCode(targetCode);
                      }
                      notify(`自动同步对接码 ${targetCode}，载入成功`, 'success');
                      startPoll();
                    } else {
                      notify(`载入失败：${r.msg || '平台已无该号或已被他人占用'}`, 'error');
                    }
                  }}>载入</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* API 配置模态框 */}
      {showSettings && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal">
            <h3 className="modal-title">平台 API 配置</h3>
            <p className="modal-desc">请填入豪猪网的对接凭证信息</p>
            <div className="input-group" style={{ marginBottom: 12 }}>
              <label className="input-label">API 账号名</label>
              <input type="text" value={tmpUser} onChange={e => setTmpUser(e.target.value)} placeholder="输入账号名" />
            </div>
            <div className="input-group" style={{ marginBottom: 20 }}>
              <label className="input-label">API 密码</label>
              <input type="password" value={tmpPass} onChange={e => setTmpPass(e.target.value)} placeholder="输入密码" />
            </div>
            <div className="input-group" style={{ marginBottom: 20 }}>
              <label className="input-label">项目对接码</label>
              <input type="text" value={tmpCode} onChange={e => setTmpCode(e.target.value)} placeholder="如 28209-xxxx" />
            </div>
            <div className="modal-actions">
              <button className="btn-flat" onClick={() => setShowSettings(false)}>取消</button>
              <button className="btn-primary" onClick={saveSettings}>保存并重启</button>
            </div>
          </div>
        </div>
      )}

      {/* 指定号码获取模态框 */}
      {showGetModal && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal" style={{ maxWidth: 320 }}>
            <h3 className="modal-title" style={{ fontSize: 16 }}>获取号码</h3>
            <p className="modal-desc" style={{ marginBottom: 16 }}>您可以填入一个指定手机号 (选填)</p>
            <div className="input-group" style={{ marginBottom: 20 }}>
              <input type="text" value={designatedPhone} onChange={e => setDesignatedPhone(e.target.value)}
                placeholder="留空则获取随机新号" style={{ textAlign: 'center', fontSize: 16, letterSpacing: 1 }} />
            </div>
            <div className="modal-actions">
              <button className="btn-flat" onClick={() => setShowGetModal(false)}>取消</button>
              <button className="btn-primary" onClick={handleGetPhone}>立即获取</button>
            </div>
          </div>
        </div>
      )}

      {/* 绑定邮箱模态框 */}
      {showPinModal && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal">
            <h3 className="modal-title">为号码绑定对应邮箱</h3>
            <p className="modal-desc">号码：<span className="modal-phone">{modalTargetPhone}</span></p>
            <div className="input-group" style={{ marginBottom: 24 }}>
              <label className="input-label">绑定谷歌邮箱 (只需填写前缀)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="text" value={emailInput} onChange={e => setEmailInput(e.target.value)}
                  placeholder="输入前缀" style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>@gmail.com</span>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-flat" onClick={() => setShowPinModal(false)}>取消</button>
              <button className="btn-primary" onClick={() => {
                const finalEmail = emailInput.trim();
                if (!finalEmail) return alert('邮箱前缀不能为空');
                setPinnedList(prev => {
                  const next = [...prev];
                  const existIdx = next.findIndex(p => p.phone === modalTargetPhone);
                  if (existIdx >= 0) {
                    next[existIdx].email = finalEmail;
                  } else {
                    next.unshift({ phone: modalTargetPhone, email: finalEmail, apiCode });
                  }
                  return next;
                });
                if (modalTargetPhone === phone) setPinnedEmail(finalEmail);
                setShowPinModal(false);
                notify('绑定已更新', 'success');
              }}>保存绑定</button>
            </div>
          </div>
        </div>
      )}

      {/* 断线重连模态框 */}
      {showReloadModal && (
        <div className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal">
            <h3 className="modal-title">发现未完成的号码</h3>
            <p className="modal-desc" style={{ marginBottom: 24 }}>您已刷新页面。<br />是否重新获取并继续监听以下号码？</p>
            <div className="the-number" style={{ fontSize: 24, marginBottom: 24 }}>{phone}</div>
            <div className="modal-actions">
              <button className="btn-flat" onClick={async () => {
                await api.cancelPhone(token, phone);
                setPhone(null);
                setPinnedEmail(null);
                setShowReloadModal(false);
              }}>释放不用了</button>
              <button className="btn-primary" onClick={async () => {
                setShowReloadModal(false);
                notify(`正在重新挂载号码...`, 'info', false);
                await api.cancelAll(token);
                const r = await api.getPhone(token, apiCode, phone);
                if (r.code === 1 || r.code === 200 || r.phone || r.data?.phone) {
                  notify('重新获取成功，继续监听短信', 'success');
                  startPoll();
                } else {
                  setPhone(null);
                  notify(`重新获取失败：${r.msg || '平台无该号'}`, 'error');
                }
              }}>重新获取</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
