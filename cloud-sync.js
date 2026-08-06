const cloudbase = globalThis.cloudbase;
if (!cloudbase) throw new Error('CloudBase SDK 未加载');

const ENV_ID = 'sonseducation-d5glzge0b6d2738d4';
const REGION = 'ap-shanghai';
const ACCESS_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL3NvbnNlZHVjYXRpb24tZDVnbHpnZTBiNmQyNzM4ZDQuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6InNvbnNlZHVjYXRpb24tZDVnbHpnZTBiNmQyNzM4ZDQiLCJleHAiOjQwODk0NDAxNDcsImlhdCI6MTc4NTc1Njk0Nywibm9uY2UiOiI5R3oyeGFESFJUSzBmSkxkUXExNF9nIiwiYXRfaGFzaCI6IjlHejJ4YURIUlRLMGZKTGRRcTE0X2ciLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoic29uc2VkdWNhdGlvbi1kNWdsemdlMGI2ZDI3MzhkNCIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.A9VuDHB_a4AI7acLU9Ksuscox8J53XVk97HkrALtiZMwbwNWDI22r3Fa-vFlbqNhbzc7cDfyKR-qorjztslgEmvYgvLIYCirqK5zdPMTB3gEb_fgbmJN8AxXyUeIfK7yuMpcX5jT0KLn3EY95m-bUpPnBOkt-HFXR223SsG4G3cmkFpn9iYHrKRWOjKm9HbnMOdl_2A-0GbrbWTZxQOfsLILQdFr0XWEhHx6o0odvSnrmfT5zgOtiVNNbTp8bPXGLlGyHLsnW7Vnit0FQLZ86RUin6O2FQJS7J6HMjfknzUog41fMYRFtcQvtMxR9S5vKejm0ERqicFuI7qxld1tVg';
const COLLECTION = 'nce1_student_progress';
const SYNC_DELAY = 900;
const RETRY_DELAY = 12000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeValue(localValue, cloudValue, preferLocal) {
  if (localValue === undefined || localValue === null || localValue === '') return cloudValue;
  if (cloudValue === undefined || cloudValue === null || cloudValue === '') return localValue;
  if (Array.isArray(localValue) && Array.isArray(cloudValue)) {
    return clone(preferLocal ? localValue : cloudValue);
  }
  if (isObject(localValue) && isObject(cloudValue)) {
    const result = {};
    const keys = new Set([...Object.keys(localValue), ...Object.keys(cloudValue)]);
    keys.forEach((key) => {
      result[key] = mergeValue(localValue[key], cloudValue[key], preferLocal);
    });
    return result;
  }
  return preferLocal ? localValue : cloudValue;
}

function mergeStates(localState = {}, cloudState = {}, cloudUpdatedAt = 0) {
  const localTime = Number(localState.updatedAt) || 0;
  const cloudTime = Number(cloudState.updatedAt || Date.parse(cloudUpdatedAt)) || 0;
  const merged = mergeValue(localState, cloudState, localTime >= cloudTime);
  merged.updatedAt = Math.max(Date.now(), localTime, cloudTime);
  return merged;
}

function extractUser(response) {
  return response?.data?.user || response?.user || response?.data || null;
}

function extractSession(response) {
  return response?.data?.session || response?.session || response?.data || null;
}

function userIdOf(user) {
  return user?.id || user?.uid || user?._id || '';
}

function isNamedUser(user, session) {
  if (!user || !session || user.is_anonymous || user.isAnonymous) return false;
  return String(session.loginType || session.login_type || '').toUpperCase() !== 'ANONYMOUS';
}

function usernameOf(user, key) {
  return user?.username
    || user?.user_metadata?.username
    || user?.metadata?.username
    || localStorage.getItem(key)
    || '学生';
}

function displayNameOf(user, username) {
  return user?.name
    || user?.nickname
    || user?.nickName
    || user?.user_metadata?.name
    || user?.user_metadata?.nickname
    || username
    || '学生';
}

function ensureCloudUi(appLabel) {
  const existing = document.getElementById('cloudSyncGate');
  if (existing) return existing;
  const style = document.createElement('style');
  style.textContent = `
    body.cloud-auth-locked > *:not(#cloudSyncGate) { visibility: hidden !important; }
    #cloudSyncGate { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 20px; background: linear-gradient(145deg,#527ff2,#7768ea); color: #fff; font-family: -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; }
    #cloudSyncGate .cloud-card { width: min(100%,420px); padding: 24px; border: 1px solid rgba(255,255,255,.28); border-radius: 18px; background: rgba(255,255,255,.14); box-shadow: 0 18px 48px rgba(35,45,100,.25); backdrop-filter: blur(10px); }
    #cloudSyncGate h2 { margin: 0 0 8px; font-size: 20px; }
    #cloudSyncGate p { margin: 0 0 16px; font-size: 13px; opacity: .92; }
    #cloudSyncGate .cloud-status { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 13px; }
    #cloudSyncGate .cloud-dot { width: 9px; height: 9px; border-radius: 50%; background: #ffd86b; box-shadow: 0 0 0 3px rgba(255,216,107,.18); }
    #cloudSyncGate .cloud-dot.online { background: #77e39d; box-shadow: 0 0 0 3px rgba(119,227,157,.2); }
    #cloudSyncGate .cloud-dot.error { background: #ff9a97; box-shadow: 0 0 0 3px rgba(255,154,151,.2); }
    #cloudSyncGate form { display: grid; gap: 9px; }
    #cloudSyncGate input { box-sizing: border-box; width: 100%; border: 1px solid rgba(255,255,255,.5); border-radius: 9px; padding: 10px 11px; background: rgba(255,255,255,.96); color: #263249; font: inherit; outline: none; }
    #cloudSyncGate input:focus { border-color: #ffd86b; box-shadow: 0 0 0 2px rgba(255,216,107,.2); }
    #cloudSyncGate button { border: 1px solid rgba(255,255,255,.6); border-radius: 9px; padding: 9px 12px; background: rgba(255,255,255,.16); color: #fff; cursor: pointer; font: inherit; font-weight: 700; }
    #cloudSyncGate button.primary { border-color: #fff; background: #fff; color: #3a63d0; }
    #cloudSyncGate .cloud-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    #cloudSyncGate .cloud-message { min-height: 18px; font-size: 12px; }
    #cloudSyncGate.signed-in { inset: 14px 14px auto auto; width: auto; padding: 0; background: transparent; align-items: stretch; justify-content: flex-end; pointer-events: none; }
    #cloudSyncGate.signed-in .cloud-card { width: auto; min-width: 230px; padding: 10px 12px; border-radius: 10px; background: rgba(42,51,72,.92); box-shadow: 0 6px 20px rgba(42,51,72,.25); pointer-events: auto; }
    #cloudSyncGate.signed-in h2, #cloudSyncGate.signed-in p, #cloudSyncGate.signed-in form { display: none; }
    #cloudSyncGate.signed-in .cloud-status { margin: 0 0 8px; }
    @media (max-width:520px) { #cloudSyncGate.signed-in { inset: auto 10px 10px; } #cloudSyncGate.signed-in .cloud-card { min-width: 0; width: 100%; } }
  `;
  document.head.appendChild(style);
  const gate = document.createElement('div');
  gate.id = 'cloudSyncGate';
  gate.innerHTML = `<div class="cloud-card"><h2>☁️ ${appLabel}</h2><p>请使用学生账号登录；学习进度和收藏会同步到 CloudBase。</p><div class="cloud-status" role="status" aria-live="polite"><i class="cloud-dot" id="cloudSyncDot"></i><span id="cloudSyncStatus">正在准备云端同步…</span></div><form id="cloudLoginForm"><input id="cloudUsername" type="text" placeholder="学生账号" autocomplete="username" minlength="5" maxlength="24" required><input id="cloudPassword" type="password" placeholder="密码" autocomplete="current-password" minlength="8" maxlength="32" required><div class="cloud-actions"><button class="primary" type="submit">登录并同步</button></div><div class="cloud-message" id="cloudAuthMessage" role="status" aria-live="polite"></div></form><div class="cloud-actions"><button id="cloudSyncNow" type="button" hidden>立即同步</button><button id="cloudLogout" type="button" hidden>退出账号</button></div></div>`;
  document.body.appendChild(gate);
  document.body.classList.add('cloud-auth-locked');
  return gate;
}

export async function createCloudSync({ appId, appLabel, storageKey, getState, applyState, getSummary, onAuthenticated, onSignedOut }) {
  const gate = ensureCloudUi(appLabel);
  const elements = {
    dot: gate.querySelector('#cloudSyncDot'),
    status: gate.querySelector('#cloudSyncStatus'),
    syncNow: gate.querySelector('#cloudSyncNow'),
    logout: gate.querySelector('#cloudLogout'),
    form: gate.querySelector('#cloudLoginForm'),
    username: gate.querySelector('#cloudUsername'),
    password: gate.querySelector('#cloudPassword'),
    message: gate.querySelector('#cloudAuthMessage')
  };
  const app = cloudbase.init({ env: ENV_ID, region: REGION, accessKey: ACCESS_KEY });
  const auth = typeof app.auth === 'function' ? app.auth() : app.auth;
  const collection = app.database().collection(COLLECTION);
  let user = null;
  let username = '';
  let displayName = '';
  let documentId = '';
  let syncTimer = null;
  let retryTimer = null;
  let syncing = false;
  let stateCache = {};

  function setStatus(text, tone = 'idle') {
    elements.status.textContent = text;
    elements.dot.classList.toggle('online', tone === 'online');
    elements.dot.classList.toggle('error', tone === 'error');
  }

  function updateUi() {
    const signedIn = Boolean(user);
    document.body.classList.toggle('cloud-auth-locked', !signedIn);
    gate.classList.toggle('signed-in', signedIn);
    elements.form.hidden = signedIn;
    elements.syncNow.hidden = !signedIn;
    elements.logout.hidden = !signedIn;
    elements.password.value = '';
    elements.message.textContent = signedIn ? '' : '账号由老师创建；密码不会保存到网页中。';
    setStatus(signedIn ? `${displayName} · 云端记录已连接` : '登录后进入课程', signedIn ? 'online' : 'idle');
  }

  function record(state) {
    return {
      appId,
      studentName: displayName,
      loginName: username,
      userId: userIdOf(user),
      state: clone(state),
      summary: getSummary(),
      schemaVersion: 1,
      updatedAt: new Date().toISOString()
    };
  }

  async function findRecord() {
    const userId = userIdOf(user);
    const query = userId ? { appId, userId } : { appId, loginName: username };
    const result = await collection.where(query).limit(1).get();
    if (result?.code) throw new Error(result.message || result.code);
    return result?.data?.[0] || null;
  }

  async function writeState(state) {
    const result = documentId
      ? await collection.doc(documentId).update(record(state))
      : await collection.add(record(state));
    if (result?.code) throw new Error(result.message || result.code);
    if (!documentId) documentId = result?.id || result?._id || '';
  }

  async function loadAndMerge() {
    setStatus(`${displayName} · 正在合并学习记录…`);
    const cloudRecord = await findRecord();
    documentId = cloudRecord?._id || '';
    const merged = mergeStates(getState(), cloudRecord?.state || {}, cloudRecord?.updatedAt);
    stateCache = merged;
    applyState(merged);
    await writeState(merged);
    setStatus(`${displayName} · 已同步`, 'online');
  }

  async function syncNow() {
    if (!user || syncing) return;
    clearTimeout(syncTimer);
    clearTimeout(retryTimer);
    syncing = true;
    setStatus(`${displayName} · 正在同步…`);
    try {
      stateCache = mergeStates(getState(), stateCache, stateCache.updatedAt);
      await writeState(stateCache);
      setStatus(`${displayName} · 已同步`, 'online');
    } catch (error) {
      setStatus('本机已保存 · 云同步待重试', 'error');
      retryTimer = setTimeout(() => syncNow(), RETRY_DELAY);
      console.error('CloudBase 同步失败', error);
    } finally {
      syncing = false;
    }
  }

  function queueSync() {
    if (!user) return;
    setStatus(`${displayName} · 待同步`);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), SYNC_DELAY);
  }

  async function login(loginName, password) {
    elements.message.textContent = '正在登录并读取云端记录…';
    setStatus('正在连接 CloudBase…');
    const response = await auth.signInWithPassword({ username: loginName, password });
    if (response?.error) throw response.error;
    const nextUser = extractUser(response);
    const session = extractSession(response);
    if (!isNamedUser(nextUser, session)) throw new Error('未获得有效的学生登录状态');
    user = nextUser;
    username = loginName;
    displayName = displayNameOf(user, username);
    localStorage.setItem(`${storageKey}-last-username`, username);
    onAuthenticated?.({ userId: userIdOf(user), username });
    await loadAndMerge();
    updateUi();
  }

  async function restoreSession() {
    try {
      const sessionResponse = await auth.getSession();
      if (sessionResponse?.error) return;
      const session = extractSession(sessionResponse);
      if (!session) return;
      const userResponse = await auth.getUser();
      if (userResponse?.error) return;
      const nextUser = extractUser(userResponse);
      if (!isNamedUser(nextUser, session)) return;
      user = nextUser;
      username = usernameOf(user, `${storageKey}-last-username`);
      displayName = displayNameOf(user, username);
      onAuthenticated?.({ userId: userIdOf(user), username });
      await loadAndMerge();
      updateUi();
    } catch (error) {
      setStatus('本机保存 · 云端会话恢复失败', 'error');
      console.error('CloudBase 会话恢复失败', error);
    }
  }

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const loginName = elements.username.value.trim();
    const password = elements.password.value;
    if (!loginName || !password) return;
    const submit = elements.form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await login(loginName, password);
    } catch (error) {
      elements.message.textContent = error?.message || '登录失败，请检查账号和密码。';
      setStatus('登录失败 · 请重试', 'error');
    } finally {
      submit.disabled = false;
    }
  });
  elements.logout.addEventListener('click', async () => {
    try {
      await syncNow();
      const response = await auth.signOut();
      if (response?.error) throw response.error;
    } catch (error) {
      console.error('退出 CloudBase 失败', error);
    }
    user = null;
    username = '';
    displayName = '';
    documentId = '';
    onSignedOut?.();
    updateUi();
  });
  elements.syncNow.addEventListener('click', () => syncNow());
  window.addEventListener('online', () => syncNow());
  updateUi();
  await restoreSession();
  return { queueSync, syncNow };
}
