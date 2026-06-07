const App = {
  currentPanel: 'capture',
  backgroundPort: null,
  tabId: null,

  init() {
    this.tabId = chrome.devtools.inspectedWindow.tabId;
    this.setupNavigation();
    this.setupTabs();
    this.setupBackgroundConnection();
    this.loadCurrentEnv();
    this.initPanels();
  },

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const panel = item.dataset.panel;
        this.switchPanel(panel);
      });
    });
  },

  switchPanel(panelName) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.panel === panelName);
    });

    document.querySelectorAll('.panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${panelName}`);
    });

    this.currentPanel = panelName;

    if (panelName === 'capture' && typeof CapturePanel !== 'undefined') {
      CapturePanel.refreshList();
    } else if (panelName === 'mock' && typeof MockPanel !== 'undefined') {
      MockPanel.loadMocks();
    } else if (panelName === 'docs' && typeof DocsPanel !== 'undefined') {
      DocsPanel.loadCollections();
    } else if (panelName === 'env' && typeof EnvPanel !== 'undefined') {
      EnvPanel.loadEnvironments();
    } else if (panelName === 'history' && typeof HistoryPanel !== 'undefined') {
      HistoryPanel.loadHistory();
    } else if (panelName === 'sync' && typeof SyncPanel !== 'undefined') {
      SyncPanel.loadSyncConfig();
    }
  },

  setupTabs() {
    document.querySelectorAll('.tabs').forEach(tabsContainer => {
      const tabs = tabsContainer.querySelectorAll('.tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.tab;
          const parent = tabsContainer.parentElement;

          tabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const contents = parent.querySelectorAll('.tab-content');
          contents.forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
          });
        });
      });
    });

    document.querySelectorAll('.detail-tabs').forEach(tabsContainer => {
      const tabs = tabsContainer.querySelectorAll('.detail-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.tab;
          const parent = tabsContainer.parentElement;

          tabsContainer.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const contents = parent.querySelectorAll('.detail-tab-content');
          contents.forEach(content => {
            content.classList.toggle('active', content.id === `detail-${tabName}`);
          });
        });
      });
    });

    const historyTabs = document.querySelectorAll('.history-tabs .tab');
    historyTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.historyTab;
        
        historyTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.history-tab-content').forEach(content => {
          content.classList.toggle('active', content.id === `history-${tabName}`);
        });
      });
    });
  },

  setupBackgroundConnection() {
    this.backgroundPort = chrome.runtime.connect({ name: 'devtools' });
    
    this.backgroundPort.postMessage({
      type: 'INIT',
      tabId: this.tabId
    });

    this.backgroundPort.onMessage.addListener((message) => {
      this.handleBackgroundMessage(message);
    });

    this.backgroundPort.onDisconnect.addListener(() => {
      console.log('Disconnected from background');
    });
  },

  handleBackgroundMessage(message) {
    const { type, data } = message;

    switch (type) {
      case 'REQUEST_CAPTURED':
        if (typeof CapturePanel !== 'undefined') {
          CapturePanel.addRequest(data);
        }
        if (typeof HistoryPanel !== 'undefined') {
          HistoryPanel.addRequest(data);
        }
        break;
      
      case 'REQUESTS_CLEARED':
        if (typeof CapturePanel !== 'undefined') {
          CapturePanel.clearRequests();
        }
        break;
      
      case 'ENVIRONMENT_UPDATED':
      case 'ENVIRONMENT_DELETED':
      case 'CURRENT_ENV_CHANGED':
        this.loadCurrentEnv();
        if (typeof EnvPanel !== 'undefined') {
          EnvPanel.loadEnvironments();
        }
        if (typeof RequestPanel !== 'undefined' && RequestPanel.reloadEnv) {
          RequestPanel.reloadEnv();
        }
        break;
      
      case 'COLLECTION_UPDATED':
      case 'COLLECTION_DELETED':
        if (typeof DocsPanel !== 'undefined') {
          DocsPanel.loadCollections();
        }
        break;
      
      case 'MOCK_UPDATED':
      case 'MOCK_DELETED':
        if (typeof MockPanel !== 'undefined') {
          MockPanel.loadMocks();
        }
        break;
      
      case 'FAVORITE_UPDATED':
        if (typeof HistoryPanel !== 'undefined') {
          HistoryPanel.loadFavorites();
        }
        break;
      
      case 'DOC_UPDATED':
        if (typeof DocsPanel !== 'undefined') {
          DocsPanel.refreshDoc(data);
        }
        break;
    }
  },

  sendToBackground(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          resolve(response.data);
        } else {
          reject(response?.error || 'Unknown error');
        }
      });
    });
  },

  async loadCurrentEnv() {
    try {
      const currentEnvId = await this.sendToBackground('GET_CURRENT_ENV');
      const environments = await this.sendToBackground('GET_ENVIRONMENTS');
      const currentEnv = environments.find(e => e.id === currentEnvId);
      
      const envIndicator = document.getElementById('envIndicator');
      if (envIndicator && currentEnv) {
        const envNameEl = envIndicator.querySelector('.env-name');
        if (envNameEl) {
          envNameEl.textContent = currentEnv.name;
        }
      }
    } catch (e) {
      console.error('Failed to load current env:', e);
    }
  },

  initPanels() {
    if (typeof CapturePanel !== 'undefined' && CapturePanel.init) {
      CapturePanel.init();
    }
    if (typeof RequestPanel !== 'undefined' && RequestPanel.init) {
      RequestPanel.init();
    }
    if (typeof MockPanel !== 'undefined' && MockPanel.init) {
      MockPanel.init();
    }
    if (typeof DocsPanel !== 'undefined' && DocsPanel.init) {
      DocsPanel.init();
    }
    if (typeof EnvPanel !== 'undefined' && EnvPanel.init) {
      EnvPanel.init();
    }
    if (typeof HistoryPanel !== 'undefined' && HistoryPanel.init) {
      HistoryPanel.init();
    }
    if (typeof SyncPanel !== 'undefined' && SyncPanel.init) {
      SyncPanel.init();
    }
  },

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  },

  _pendingSaveApi: null,

  async openSaveToCollectionModal(apiData) {
    this._pendingSaveApi = apiData;

    const modal = document.getElementById('saveToCollectionModal');
    if (!modal) return;

    try {
      const collections = await this.sendToBackground('GET_COLLECTIONS');
      const select = document.getElementById('collectionSelect');
      if (select) {
        select.innerHTML = '<option value="">-- 请选择 --</option>' +
          collections.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
      }
    } catch (e) {
      console.error('Failed to load collections:', e);
    }

    const nameInput = document.getElementById('apiNameInput');
    if (nameInput && apiData) {
      nameInput.value = apiData.name || Utils.getUrlPath(apiData.url || '') || '';
    }

    modal.style.display = 'flex';

    this._bindSaveModalEvents();
  },

  closeSaveToCollectionModal() {
    const modal = document.getElementById('saveToCollectionModal');
    if (modal) {
      modal.style.display = 'none';
    }
    this._pendingSaveApi = null;
  },

  _bindSaveModalEvents() {
    const closeBtn = document.getElementById('closeSaveModal');
    if (closeBtn && !closeBtn._bound) {
      closeBtn.addEventListener('click', () => this.closeSaveToCollectionModal());
      closeBtn._bound = true;
    }

    const cancelBtn = document.getElementById('cancelSaveBtn');
    if (cancelBtn && !cancelBtn._bound) {
      cancelBtn.addEventListener('click', () => this.closeSaveToCollectionModal());
      cancelBtn._bound = true;
    }

    const confirmBtn = document.getElementById('confirmSaveBtn');
    if (confirmBtn && !confirmBtn._bound) {
      confirmBtn.addEventListener('click', () => this._confirmSaveToCollection());
      confirmBtn._bound = true;
    }

    const modal = document.getElementById('saveToCollectionModal');
    if (modal && !modal._bound) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeSaveToCollectionModal();
        }
      });
      modal._bound = true;
    }
  },

  async _confirmSaveToCollection() {
    if (!this._pendingSaveApi) {
      this.closeSaveToCollectionModal();
      return;
    }

    const collectionId = document.getElementById('collectionSelect')?.value;
    const newCollectionName = document.getElementById('newCollectionName')?.value?.trim();
    const apiName = document.getElementById('apiNameInput')?.value?.trim();
    const saveResponse = document.getElementById('saveResponseExample')?.checked;

    let collection;

    if (newCollectionName) {
      collection = {
        id: Utils.generateId(),
        name: newCollectionName,
        description: '',
        apis: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    } else if (collectionId) {
      try {
        const collections = await this.sendToBackground('GET_COLLECTIONS');
        collection = collections.find(c => c.id === collectionId);
        if (!collection) {
          this.showToast('集合不存在', 'error');
          return;
        }
      } catch (e) {
        this.showToast('加载集合失败: ' + e, 'error');
        return;
      }
    } else {
      this.showToast('请选择集合或新建集合', 'error');
      return;
    }

    const apiData = this._pendingSaveApi;
    const newApi = {
      id: Utils.generateId(),
      name: apiName || Utils.getUrlPath(apiData.url || '') || '未命名接口',
      method: apiData.method || 'GET',
      url: apiData.url || '',
      description: apiData.description || '',
      requestHeaders: apiData.headers || apiData.requestHeaders || {},
      requestBody: apiData.requestBody || apiData.body || null,
      responseExample: saveResponse ? (apiData.responseBody || apiData.responseExample || null) : null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    collection.apis = collection.apis || [];
    collection.apis.push(newApi);
    collection.updatedAt = Date.now();

    try {
      await this.sendToBackground('SAVE_COLLECTION', collection);
      this.showToast('已保存到集合');
      this.closeSaveToCollectionModal();

      if (typeof DocsPanel !== 'undefined' && DocsPanel.loadCollections) {
        DocsPanel.loadCollections();
      }
    } catch (e) {
      this.showToast('保存失败: ' + e, 'error');
    }
  },

  formatJson(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  renderJson(data) {
    return this.renderJsonTree(data, true);
  },

  renderJsonTree(data, expanded = false, level = 0) {
    if (data === null || data === undefined) {
      return '<span class="json-null">null</span>';
    }

    const type = typeof data;

    if (type === 'string') {
      return `<span class="json-string">"${this.escapeHtml(data)}"</span>`;
    }

    if (type === 'number') {
      return `<span class="json-number">${data}</span>`;
    }

    if (type === 'boolean') {
      return `<span class="json-boolean">${data}</span>`;
    }

    if (type === 'object') {
      const treeId = 'jstree_' + Math.random().toString(36).substr(2, 9);

      if (Array.isArray(data)) {
        if (data.length === 0) return '[]';
        const items = data.map(item => {
          return `<div class="json-tree-item">${this.renderJsonTree(item, expanded, level + 1)}</div>`;
        }).join('');
        const isOpen = expanded ? 'open' : '';
        return `
          <div class="json-tree ${isOpen}" data-tree="${treeId}">
            <span class="json-tree-toggle" onclick="App.toggleJsonTree(this)">▶</span>
            <span class="json-array-bracket">[</span>
            <span class="json-array-count">${data.length} items</span>
            <div class="json-tree-children">
              ${items}
            </div>
            <span class="json-array-bracket">]</span>
          </div>
        `;
      } else {
        const keys = Object.keys(data);
        if (keys.length === 0) return '{}';
        const items = keys.map(key => {
          return `
            <div class="json-tree-item">
              <span class="json-key">"${this.escapeHtml(key)}"</span>: ${this.renderJsonTree(data[key], expanded, level + 1)}
            </div>
          `;
        }).join('');
        const isOpen = expanded ? 'open' : '';
        return `
          <div class="json-tree ${isOpen}" data-tree="${treeId}">
            <span class="json-tree-toggle" onclick="App.toggleJsonTree(this)">▶</span>
            <span class="json-object-brace">{</span>
            <span class="json-object-count">${keys.length} keys</span>
            <div class="json-tree-children">
              ${items}
            </div>
            <span class="json-object-brace">}</span>
          </div>
        `;
      }
    }

    return this.escapeHtml(String(data));
  },

  toggleJsonTree(el) {
    const tree = el.parentElement;
    if (tree) {
      tree.classList.toggle('open');
    }
  },
};

function initPanel() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
}

if (typeof window !== 'undefined') {
  window.initPanel = initPanel;
  window.App = App;
}
