const API_BASE = 'https://api.haozhuma.com/sms/';
const SID = '28209';

async function apiCall(params) {
    const url = API_BASE + '?' + new URLSearchParams(params).toString();
    try {
        const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!resp.ok) return { code: -1, msg: 'HTTP ' + resp.status, httpStatus: resp.status };
        const text = await resp.text();
        try { return JSON.parse(text); } catch (e) { return { code: -1, msg: text }; }
    } catch (e) { return { code: -1, msg: '网络错误：' + e.message }; }
}

export const api = {
    login: async (user, pass) => await apiCall({ api: 'login', user, pass }),
    getUserInfo: async (token) => await apiCall({ api: 'getSummary', token }),
    getPhone: async (token, author, phoneParam = null) => {
        const params = { api: 'getPhone', author, token, sid: SID, mobile: 1 };
        if (phoneParam) params.phone = phoneParam;
        return await apiCall(params);
    },
    getSms: async (token, author, phone) => await apiCall({ api: 'getMessage', author, token, sid: SID, phone }),
    cancelPhone: async (token, phone) => await apiCall({ api: 'cancelPhone', token, phone, sid: SID }),
    cancelAll: async (token) => await apiCall({ api: 'cancelAllRecv', token }),
    blackPhone: async (token, phone) => await apiCall({ api: 'blackPhone', token, phone, sid: SID })
};
