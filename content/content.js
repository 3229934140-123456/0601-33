(function() {
  'use strict';

  const state = {
    mockRules: [],
    isMockEnabled: true,
    interceptorReady: false
  };

  const sendToBackground = (type, payload) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        resolve(response);
      });
    });
  };

  const reportCapturedRequest = (requestData) => {
    chrome.runtime.sendMessage({
      type: 'REQUEST_CAPTURED',
      payload: requestData
    });
  };

  const loadMockRules = async () => {
    try {
      const response = await sendToBackground('GET_MOCKS');
      if (response && response.success && response.data) {
        state.mockRules = response.data;
      }
    } catch (e) {
      console.warn('[API Debugger] 加载 Mock 规则失败:', e);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await sendToBackground('GET_SETTINGS');
      if (response && response.success && response.data) {
        state.isMockEnabled = response.data.mockEnabled !== false;
      }
    } catch (e) {
      console.warn('[API Debugger] 加载设置失败:', e);
    }
  };

  const pushMockStateToPage = () => {
    window.postMessage({
      source: 'api-debugger-content',
      type: 'MOCK_STATE_UPDATE',
      payload: {
        mockRules: state.mockRules,
        isMockEnabled: state.isMockEnabled
      }
    }, '*');
  };

  const injectInterceptor = () => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/inject.js');
    script.onload = function() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };
    (document.head || document.documentElement).appendChild(script);
  };

  const initBackgroundMessageListener = () => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'MOCK_RULES_UPDATED') {
        state.mockRules = message.payload || [];
        pushMockStateToPage();
      } else if (message.type === 'MOCK_ENABLED_CHANGED') {
        state.isMockEnabled = message.payload;
        pushMockStateToPage();
      } else if (message.type === 'PING') {
        sendResponse({ pong: true });
      }
      return true;
    });
  };

  const initPageMessageListener = () => {
    window.addEventListener('message', (event) => {
      if (!event.data || event.data.source !== 'api-debugger-page') return;

      const { type, payload } = event.data;

      if (type === 'REQUEST_CAPTURED') {
        reportCapturedRequest(payload);
      } else if (type === 'INTERCEPTOR_READY') {
        state.interceptorReady = true;
        pushMockStateToPage();
      }
    });
  };

  const init = async () => {
    initBackgroundMessageListener();
    initPageMessageListener();

    await Promise.all([
      loadMockRules(),
      loadSettings()
    ]);

    injectInterceptor();
  };

  try {
    init();
  } catch (e) {
    console.error('[API Debugger] 初始化失败:', e);
  }
})();
