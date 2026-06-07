importScripts('/shared/utils.js');
importScripts('/shared/storage.js');

const Background = {
  requests: new Map(),
  devtoolsPorts: new Map(),
  tabToPort: new Map(),
  mockRules: new Map(),
  settings: {},

  async init() {
    this.settings = await Storage.getSettings();
    this.setupMessageListeners();
    this.setupDevToolsConnection();
    this.updateMockRules();
  },

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });
  },

  async handleMessage(message, sender, sendResponse) {
    const { type, payload } = message;

    switch (type) {
      case 'REQUEST_CAPTURED':
        await this.handleRequestCaptured(payload, sender);
        sendResponse({ success: true });
        break;
      
      case 'GET_REQUESTS':
        const requests = await Storage.getRequests(payload || {});
        sendResponse({ success: true, data: requests });
        break;
      
      case 'CLEAR_REQUESTS':
        await Storage.clearRequests();
        this.requests.clear();
        this.broadcastToDevTools('REQUESTS_CLEARED');
        sendResponse({ success: true });
        break;
      
      case 'GET_ENVIRONMENTS':
        const envs = await Storage.getEnvironments();
        sendResponse({ success: true, data: envs });
        break;
      
      case 'SAVE_ENVIRONMENT':
        const savedEnv = await Storage.saveEnvironment(payload);
        this.broadcastToDevTools('ENVIRONMENT_UPDATED', savedEnv);
        sendResponse({ success: true, data: savedEnv });
        break;
      
      case 'DELETE_ENVIRONMENT':
        await Storage.deleteEnvironment(payload);
        this.broadcastToDevTools('ENVIRONMENT_DELETED', payload);
        sendResponse({ success: true });
        break;
      
      case 'GET_CURRENT_ENV':
        const currentEnv = await Storage.getCurrentEnv();
        sendResponse({ success: true, data: currentEnv });
        break;
      
      case 'SET_CURRENT_ENV':
        await Storage.setCurrentEnv(payload);
        this.broadcastToDevTools('CURRENT_ENV_CHANGED', payload);
        sendResponse({ success: true });
        break;
      
      case 'GET_COLLECTIONS':
        const collections = await Storage.getCollections();
        sendResponse({ success: true, data: collections });
        break;
      
      case 'SAVE_COLLECTION':
        const savedCollection = await Storage.saveCollection(payload);
        this.broadcastToDevTools('COLLECTION_UPDATED', savedCollection);
        sendResponse({ success: true, data: savedCollection });
        break;
      
      case 'DELETE_COLLECTION':
        await Storage.deleteCollection(payload);
        this.broadcastToDevTools('COLLECTION_DELETED', payload);
        sendResponse({ success: true });
        break;
      
      case 'GET_FAVORITES':
        const favorites = await Storage.getFavorites();
        sendResponse({ success: true, data: favorites });
        break;
      
      case 'ADD_FAVORITE':
        const favList = await Storage.addFavorite(payload);
        this.broadcastToDevTools('FAVORITE_UPDATED', favList);
        sendResponse({ success: true, data: favList });
        break;
      
      case 'REMOVE_FAVORITE':
        const favs = await Storage.removeFavorite(payload);
        this.broadcastToDevTools('FAVORITE_UPDATED', favs);
        sendResponse({ success: true, data: favs });
        break;
      
      case 'GET_MOCKS':
        const mocks = await Storage.getMocks();
        sendResponse({ success: true, data: mocks });
        break;
      
      case 'SAVE_MOCK':
        const savedMock = await Storage.saveMock(payload);
        this.updateMockRules();
        this.broadcastToDevTools('MOCK_UPDATED', savedMock);
        this.broadcastMockRulesToAllTabs();
        sendResponse({ success: true, data: savedMock });
        break;
      
      case 'DELETE_MOCK':
        await Storage.deleteMock(payload);
        this.updateMockRules();
        this.broadcastToDevTools('MOCK_DELETED', payload);
        this.broadcastMockRulesToAllTabs();
        sendResponse({ success: true });
        break;
      
      case 'GET_DOCS':
        const docs = await Storage.getDocs();
        sendResponse({ success: true, data: docs });
        break;
      
      case 'SAVE_DOC':
        const savedDoc = await Storage.saveDoc(payload.apiKey, payload.doc);
        this.broadcastToDevTools('DOC_UPDATED', { apiKey: payload.apiKey, doc: savedDoc });
        sendResponse({ success: true, data: savedDoc });
        break;
      
      case 'GET_SETTINGS':
        const settings = await Storage.getSettings();
        sendResponse({ success: true, data: settings });
        break;
      
      case 'SAVE_SETTINGS':
        await Storage.saveSettings(payload);
        this.settings = { ...this.settings, ...payload };
        this.broadcastToDevTools('SETTINGS_UPDATED', payload);
        if (typeof payload.mockEnabled !== 'undefined') {
          this.broadcastMockEnabledToAllTabs(payload.mockEnabled);
        }
        sendResponse({ success: true });
        break;
      
      case 'GET_SYNC_CONFIG':
        const syncConfig = await Storage.getSyncConfig();
        sendResponse({ success: true, data: syncConfig });
        break;
      
      case 'SAVE_SYNC_CONFIG':
        await Storage.saveSyncConfig(payload);
        this.broadcastToDevTools('SYNC_CONFIG_UPDATED', payload);
        sendResponse({ success: true });
        break;
      
      case 'REPLAY_REQUEST':
        const replayResult = await this.replayRequest(payload);
        sendResponse({ success: true, data: replayResult });
        break;
      
      case 'GENERATE_CURL':
        const curl = Utils.objectToCurl(
          payload.url,
          payload.method,
          payload.headers,
          payload.body
        );
        sendResponse({ success: true, data: curl });
        break;
      
      case 'SYNC_TO_TEAM':
        const syncResult = await this.syncToTeam(payload);
        sendResponse(syncResult);
        break;
      
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  },

  async handleRequestCaptured(requestData, sender) {
    const tabId = sender.tab ? sender.tab.id : (requestData.tabId || -1);
    const requestId = requestData.id || Utils.generateId();

    const request = {
      id: requestId,
      tabId,
      method: requestData.method,
      url: requestData.url,
      headers: requestData.headers || {},
      requestBody: requestData.requestBody,
      status: requestData.status,
      statusText: requestData.statusText,
      responseHeaders: requestData.responseHeaders || {},
      responseBody: requestData.responseBody,
      responseSize: requestData.responseSize || 0,
      duration: requestData.duration || 0,
      startTime: requestData.startTime || Date.now(),
      endTime: requestData.endTime || Date.now(),
      type: requestData.type || 'xhr',
      fromCache: requestData.fromCache || false,
      isMocked: requestData.isMocked || false
    };

    this.requests.set(requestId, request);
    await Storage.addRequest(request);

    this.notifyDevTools(tabId, 'REQUEST_CAPTURED', request);
  },

  setupWebRequestListeners() {
    if (!this.settings.autoCapture) return;

    const filter = {
      urls: ['<all_urls>'],
      types: ['xmlhttprequest', 'fetch']
    };

    chrome.webRequest.onBeforeRequest.addListener(
      (details) => this.onBeforeRequest(details),
      filter,
      ['requestBody']
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => this.onBeforeSendHeaders(details),
      filter,
      ['requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
      (details) => this.onHeadersReceived(details),
      filter,
      ['responseHeaders']
    );

    chrome.webRequest.onCompleted.addListener(
      (details) => this.onCompleted(details),
      filter
    );

    chrome.webRequest.onErrorOccurred.addListener(
      (details) => this.onErrorOccurred(details),
      filter
    );
  },

  onBeforeRequest(details) {
    const request = {
      id: details.requestId,
      tabId: details.tabId,
      method: details.method,
      url: details.url,
      type: details.type,
      startTime: details.timeStamp,
      requestBody: this.parseRequestBody(details.requestBody)
    };
    this.requests.set(details.requestId, request);
  },

  onBeforeSendHeaders(details) {
    const request = this.requests.get(details.requestId);
    if (request) {
      request.headers = this.headersArrayToObject(details.requestHeaders);
    }
  },

  onHeadersReceived(details) {
    const request = this.requests.get(details.requestId);
    if (request) {
      request.status = details.statusCode;
      request.statusText = details.statusLine;
      request.responseHeaders = this.headersArrayToObject(details.responseHeaders);
      request.fromCache = details.fromCache;
    }

    const mockResponse = this.checkMockRule(details.url, details.method);
    if (mockResponse) {
      return {
        cancel: false
      };
    }
  },

  onCompleted(details) {
    const request = this.requests.get(details.requestId);
    if (request) {
      request.endTime = details.timeStamp;
      request.duration = details.timeStamp - request.startTime;
      request.responseSize = details.responseSize || 0;
      
      Storage.addRequest(request).then(() => {
        this.notifyDevTools(details.tabId, 'REQUEST_CAPTURED', request);
      });
    }
  },

  onErrorOccurred(details) {
    const request = this.requests.get(details.requestId);
    if (request) {
      request.error = details.error;
      request.endTime = details.timeStamp;
      request.duration = details.timeStamp - request.startTime;
      
      Storage.addRequest(request).then(() => {
        this.notifyDevTools(details.tabId, 'REQUEST_CAPTURED', request);
      });
    }
  },

  parseRequestBody(body) {
    if (!body) return null;
    if (body.raw) {
      try {
        const decoder = new TextDecoder('utf-8');
        const raw = body.raw[0]?.bytes;
        if (raw) {
          const text = decoder.decode(raw);
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        }
      } catch (e) {
        // ignore
      }
    }
    if (body.formData) {
      return body.formData;
    }
    return null;
  },

  headersArrayToObject(headers) {
    if (!headers) return {};
    const obj = {};
    headers.forEach(h => {
      obj[h.name] = h.value;
    });
    return obj;
  },

  setupDevToolsConnection() {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'devtools') {
        let tabId = null;
        
        port.onMessage.addListener((msg) => {
          if (msg.type === 'INIT') {
            tabId = msg.tabId;
            this.devtoolsPorts.set(port, tabId);
            this.tabToPort.set(tabId, port);
          }
        });

        port.onDisconnect.addListener(() => {
          this.devtoolsPorts.delete(port);
          if (tabId) {
            this.tabToPort.delete(tabId);
          }
        });
      }
    });
  },

  notifyDevTools(tabId, type, data) {
    const port = this.tabToPort.get(tabId);
    if (port) {
      try {
        port.postMessage({ type, data });
      } catch (e) {
        // port disconnected
      }
    }
  },

  broadcastToDevTools(type, data) {
    this.devtoolsPorts.forEach((tabId, port) => {
      try {
        port.postMessage({ type, data });
      } catch (e) {
        // ignore
      }
    });
  },

  async replayRequest(requestData) {
    try {
      const startTime = Date.now();
      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: requestData.headers || {},
        body: requestData.body ? (typeof requestData.body === 'string' ? requestData.body : JSON.stringify(requestData.body)) : undefined
      });
      
      const endTime = Date.now();
      const responseText = await response.text();
      
      let responseBody;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }

      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const result = {
        id: Utils.generateId(),
        method: requestData.method,
        url: requestData.url,
        headers: requestData.headers || {},
        requestBody: requestData.body,
        status: response.status,
        statusText: response.statusText,
        responseHeaders,
        responseBody,
        responseSize: responseText.length,
        duration: endTime - startTime,
        startTime,
        endTime,
        type: 'replay'
      };

      await Storage.addRequest(result);
      this.broadcastToDevTools('REQUEST_CAPTURED', result);
      
      return result;
    } catch (error) {
      return {
        id: Utils.generateId(),
        method: requestData.method,
        url: requestData.url,
        error: error.message,
        startTime: Date.now(),
        type: 'replay'
      };
    }
  },

  async updateMockRules() {
    const mocks = await Storage.getMocks();
    this.mockRules.clear();
    mocks.forEach(mock => {
      if (mock.enabled) {
        const key = `${mock.method}:${mock.urlPattern}`;
        this.mockRules.set(key, mock);
      }
    });
  },

  async broadcastMockRulesToAllTabs() {
    try {
      const mocks = await Storage.getMocks();
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'MOCK_RULES_UPDATED',
              payload: mocks
            }).catch(() => {
              // ignore errors for tabs without content script
            });
          }
        });
      });
    } catch (e) {
      console.warn('Failed to broadcast mock rules:', e);
    }
  },

  broadcastMockEnabledToAllTabs(enabled) {
    try {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: 'MOCK_ENABLED_CHANGED',
              payload: enabled
            }).catch(() => {
              // ignore errors for tabs without content script
            });
          }
        });
      });
    } catch (e) {
      console.warn('Failed to broadcast mock enabled:', e);
    }
  },

  checkMockRule(url, method) {
    for (const [key, mock] of this.mockRules) {
      const [mockMethod, pattern] = key.split(':');
      if (mockMethod === method && this.matchUrlPattern(url, pattern)) {
        return mock;
      }
    }
    return null;
  },

  matchUrlPattern(url, pattern) {
    if (pattern === url) return true;
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  },

  async syncToTeam(data) {
    const config = await Storage.getSyncConfig();
    if (!config.enabled || !config.serverUrl) {
      return { success: false, error: '同步未配置' };
    }

    try {
      const response = await fetch(`${config.serverUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Team-Id': config.teamId
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        await Storage.saveSyncConfig({ lastSyncTime: Date.now() });
        return { success: true, data: result };
      } else {
        return { success: false, error: result.error || '同步失败' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

Background.init();
