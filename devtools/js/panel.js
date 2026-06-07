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
      if (Array.isArray(data)) {
        if (data.length === 0) return '[]';
        const items = data.map(item => this.renderJson(item)).join(', ');
        return `[ ${items} ]`;
      } else {
        const keys = Object.keys(data);
        if (keys.length === 0) return '{}';
        const items = keys.map(key => {
          return `<span class="json-key">"${this.escapeHtml(key)}"</span>: ${this.renderJson(data[key])}`;
        }).join(', ');
        return `{ ${items} }`;
      }
    }

    return this.escapeHtml(String(data));
  }
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
