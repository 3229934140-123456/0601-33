const PopupApp = {
  environments: [],
  currentEnvId: null,
  settings: {},

  init() {
    this.loadData();
    this.bindEvents();
  },

  async loadData() {
    try {
      const [envs, currentEnvId, settings, requests] = await Promise.all([
        this.sendMessage('GET_ENVIRONMENTS'),
        this.sendMessage('GET_CURRENT_ENV'),
        this.sendMessage('GET_SETTINGS'),
        this.sendMessage('GET_REQUESTS')
      ]);

      this.environments = envs || [];
      this.currentEnvId = currentEnvId;
      this.settings = settings || {};
      
      this.renderEnvSelector();
      this.renderToggles();
      this.renderStats(requests || []);
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  },

  sendMessage(type, payload) {
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

  renderEnvSelector() {
    const selector = document.getElementById('envSelector');
    if (!selector) return;

    if (this.environments.length === 0) {
      selector.innerHTML = '<option value="">暂无环境</option>';
      return;
    }

    selector.innerHTML = this.environments.map(env => `
      <option value="${env.id}" ${env.id === this.currentEnvId ? 'selected' : ''}>
        ${env.name}
      </option>
    `).join('');
  },

  renderToggles() {
    const captureToggle = document.getElementById('captureToggle');
    if (captureToggle) {
      captureToggle.classList.toggle('active', this.settings.autoCapture !== false);
    }

    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle) {
      mockToggle.classList.toggle('active', this.settings.mockEnabled || false);
    }
  },

  renderStats(requests) {
    const countEl = document.getElementById('requestCount');
    const successRateEl = document.getElementById('successRate');
    const avgTimeEl = document.getElementById('avgTime');

    if (countEl) {
      countEl.textContent = requests.length;
    }

    if (successRateEl && requests.length > 0) {
      const successCount = requests.filter(r => r.status && r.status >= 200 && r.status < 400).length;
      const rate = Math.round((successCount / requests.length) * 100);
      successRateEl.textContent = rate + '%';
    }

    if (avgTimeEl && requests.length > 0) {
      const totalDuration = requests.reduce((sum, r) => sum + (r.duration || 0), 0);
      const avg = Math.round(totalDuration / requests.length);
      avgTimeEl.textContent = avg + 'ms';
    }
  },

  bindEvents() {
    const envSelector = document.getElementById('envSelector');
    if (envSelector) {
      envSelector.addEventListener('change', async (e) => {
        try {
          await this.sendMessage('SET_CURRENT_ENV', e.target.value);
          this.currentEnvId = e.target.value;
          this.showToast('已切换环境');
        } catch (err) {
          this.showToast('切换失败', 'error');
        }
      });
    }

    const captureToggle = document.getElementById('captureToggle');
    if (captureToggle) {
      captureToggle.addEventListener('click', async () => {
        const newState = !captureToggle.classList.contains('active');
        captureToggle.classList.toggle('active', newState);
        try {
          await this.sendMessage('SAVE_SETTINGS', { autoCapture: newState });
          this.settings.autoCapture = newState;
        } catch (err) {
          captureToggle.classList.toggle('active', !newState);
          this.showToast('设置失败', 'error');
        }
      });
    }

    const mockToggle = document.getElementById('mockToggle');
    if (mockToggle) {
      mockToggle.addEventListener('click', async () => {
        const newState = !mockToggle.classList.contains('active');
        mockToggle.classList.toggle('active', newState);
        try {
          await this.sendMessage('SAVE_SETTINGS', { mockEnabled: newState });
          this.settings.mockEnabled = newState;
          this.showToast(newState ? 'Mock 已启用' : 'Mock 已关闭');
        } catch (err) {
          mockToggle.classList.toggle('active', !newState);
          this.showToast('设置失败', 'error');
        }
      });
    }

    const clearAction = document.getElementById('clearAction');
    if (clearAction) {
      clearAction.addEventListener('click', async () => {
        if (!confirm('确定要清空所有请求记录吗？')) return;
        try {
          await this.sendMessage('CLEAR_REQUESTS');
          this.renderStats([]);
          this.showToast('已清空记录');
        } catch (err) {
          this.showToast('清空失败', 'error');
        }
      });
    }

    const exportAction = document.getElementById('exportAction');
    if (exportAction) {
      exportAction.addEventListener('click', async () => {
        try {
          const requests = await this.sendMessage('GET_REQUESTS');
          const data = {
            exportedAt: new Date().toISOString(),
            count: requests.length,
            requests: requests
          };
          
          Utils.downloadFile(
            JSON.stringify(data, null, 2),
            `api-requests-${Date.now()}.json`
          );
          this.showToast('导出成功');
        } catch (err) {
          this.showToast('导出失败', 'error');
        }
      });
    }

    const favoritesAction = document.getElementById('favoritesAction');
    if (favoritesAction) {
      favoritesAction.addEventListener('click', () => {
        this.showToast('请在 DevTools 面板中查看收藏');
      });
    }

    const syncAction = document.getElementById('syncAction');
    if (syncAction) {
      syncAction.addEventListener('click', async () => {
        try {
          const config = await this.sendMessage('GET_SYNC_CONFIG');
          if (config.enabled && config.serverUrl) {
            this.showToast('正在同步...', 'info');
            await this.sendMessage('SYNC_TO_TEAM', {});
            this.showToast('同步成功');
          } else {
            this.showToast('请先在设置中配置同步', 'error');
          }
        } catch (err) {
          this.showToast('同步失败: ' + err, 'error');
        }
      });
    }

    const openDevtoolsBtn = document.getElementById('openDevtoolsBtn');
    if (openDevtoolsBtn) {
      openDevtoolsBtn.addEventListener('click', () => {
        this.showToast('请打开开发者工具 (F12) 找到「API 调试」面板');
        setTimeout(() => window.close(), 1500);
      });
    }
  },

  showToast(message, type = 'success') {
    let toast = document.querySelector('.toast');
    if (toast) {
      toast.remove();
    }

    toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      color: white;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    
    const colors = {
      success: '#22c55e',
      error: '#ef4444',
      info: '#3b82f6',
      warning: '#f59e0b'
    };
    toast.style.backgroundColor = colors[type] || colors.success;
    toast.textContent = message;
    
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  PopupApp.init();
});
