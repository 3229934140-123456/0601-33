const SyncPanel = {
  syncConfig: null,
  isSyncing: false,

  init() {
    this.bindEvents();
    this.loadSyncConfig();
  },

  bindEvents() {
    const saveBtn = document.getElementById('saveSyncConfigBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveSyncConfig());
    }

    const syncNowBtn = document.getElementById('syncNowBtn');
    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', () => this.syncNow());
    }

    const maskNowBtn = document.getElementById('maskNowBtn');
    if (maskNowBtn) {
      maskNowBtn.addEventListener('click', () => this.maskSensitiveData());
    }
  },

  async loadSyncConfig() {
    try {
      const config = await App.sendToBackground('GET_SYNC_CONFIG');
      this.syncConfig = config;
      this.renderConfig();
    } catch (e) {
      console.error('Failed to load sync config:', e);
    }
  },

  renderConfig() {
    if (!this.syncConfig) return;

    const enabledCheckbox = document.getElementById('syncEnabled');
    if (enabledCheckbox) enabledCheckbox.checked = this.syncConfig.enabled;

    const serverUrlInput = document.getElementById('syncServerUrl');
    if (serverUrlInput) serverUrlInput.value = this.syncConfig.serverUrl || '';

    const apiKeyInput = document.getElementById('syncApiKey');
    if (apiKeyInput) apiKeyInput.value = this.syncConfig.apiKey || '';

    const teamIdInput = document.getElementById('syncTeamId');
    if (teamIdInput) teamIdInput.value = this.syncConfig.teamId || '';

    const autoSyncCheckbox = document.getElementById('autoSync');
    if (autoSyncCheckbox) autoSyncCheckbox.checked = this.syncConfig.autoSync;

    const syncCollections = document.getElementById('syncCollections');
    if (syncCollections) syncCollections.checked = true;

    const syncMocks = document.getElementById('syncMocks');
    if (syncMocks) syncMocks.checked = true;

    const syncEnvs = document.getElementById('syncEnvs');
    if (syncEnvs) syncEnvs.checked = true;

    const maskSensitive = document.getElementById('maskSensitive');
    if (maskSensitive) maskSensitive.checked = true;

    const sensitiveKeysInput = document.getElementById('sensitiveKeys');
    if (sensitiveKeysInput) {
      const settings = { sensitiveKeys: ['password', 'token', 'secret', 'authorization', 'api_key'] };
      sensitiveKeysInput.value = settings.sensitiveKeys?.join(', ') || 'password, token, secret, authorization, api_key';
    }

    const lastSyncTime = document.getElementById('lastSyncTime');
    if (lastSyncTime) {
      lastSyncTime.textContent = this.syncConfig.lastSyncTime 
        ? Utils.formatTime(this.syncConfig.lastSyncTime) 
        : '从未同步';
    }

    this.updateSyncStatus();
  },

  updateSyncStatus() {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;

    if (!this.syncConfig?.enabled) {
      statusEl.textContent = '未启用';
      statusEl.className = 'status-text';
    } else if (!this.syncConfig?.serverUrl || !this.syncConfig?.apiKey) {
      statusEl.textContent = '配置不完整';
      statusEl.className = 'status-text warning';
    } else {
      statusEl.textContent = '已配置';
      statusEl.className = 'status-text success';
    }
  },

  collectConfig() {
    const enabledCheckbox = document.getElementById('syncEnabled');
    const serverUrlInput = document.getElementById('syncServerUrl');
    const apiKeyInput = document.getElementById('syncApiKey');
    const teamIdInput = document.getElementById('syncTeamId');
    const autoSyncCheckbox = document.getElementById('autoSync');

    return {
      enabled: enabledCheckbox?.checked || false,
      serverUrl: serverUrlInput?.value?.trim() || '',
      apiKey: apiKeyInput?.value?.trim() || '',
      teamId: teamIdInput?.value?.trim() || '',
      autoSync: autoSyncCheckbox?.checked || false
    };
  },

  async saveSyncConfig() {
    const config = this.collectConfig();

    if (config.enabled) {
      if (!config.serverUrl) {
        App.showToast('请输入同步服务器地址', 'error');
        return;
      }
      if (!config.apiKey) {
        App.showToast('请输入 API Key', 'error');
        return;
      }
    }

    try {
      await App.sendToBackground('SAVE_SYNC_CONFIG', config);
      this.syncConfig = { ...this.syncConfig, ...config };
      this.updateSyncStatus();
      App.showToast('同步配置已保存');
    } catch (e) {
      App.showToast('保存失败: ' + e, 'error');
    }
  },

  async syncNow() {
    if (this.isSyncing) {
      App.showToast('正在同步中，请稍候...', 'info');
      return;
    }

    if (!this.syncConfig?.enabled || !this.syncConfig?.serverUrl || !this.syncConfig?.apiKey) {
      App.showToast('请先配置并启用同步', 'error');
      return;
    }

    this.isSyncing = true;
    const syncNowBtn = document.getElementById('syncNowBtn');
    if (syncNowBtn) {
      syncNowBtn.disabled = true;
      syncNowBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        同步中...
      `;
    }

    try {
      const data = await this.collectSyncData();
      const result = await App.sendToBackground('SYNC_TO_TEAM', data);
      
      if (result?.success) {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
          statusEl.textContent = '同步成功';
          statusEl.className = 'status-text success';
        }
        
        const lastSyncTime = document.getElementById('lastSyncTime');
        if (lastSyncTime) {
          lastSyncTime.textContent = Utils.formatTime(Date.now());
        }
        
        App.showToast('同步成功');
      } else {
        App.showToast('同步失败: ' + (result?.error || '未知错误'), 'error');
      }
    } catch (e) {
      App.showToast('同步失败: ' + e, 'error');
    } finally {
      this.isSyncing = false;
      if (syncNowBtn) {
        syncNowBtn.disabled = false;
        syncNowBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          立即同步
        `;
      }
    }
  },

  async collectSyncData() {
    const data = {
      timestamp: Date.now(),
      collections: [],
      mocks: [],
      environments: []
    };

    const syncCollections = document.getElementById('syncCollections')?.checked;
    const syncMocks = document.getElementById('syncMocks')?.checked;
    const syncEnvs = document.getElementById('syncEnvs')?.checked;
    const maskSensitive = document.getElementById('maskSensitive')?.checked;

    if (syncCollections) {
      try {
        const collections = await App.sendToBackground('GET_COLLECTIONS');
        data.collections = maskSensitive 
          ? Utils.maskSensitiveData(collections, this.getSensitiveKeys())
          : collections;
      } catch (e) {
        console.error('Failed to get collections:', e);
      }
    }

    if (syncMocks) {
      try {
        const mocks = await App.sendToBackground('GET_MOCKS');
        data.mocks = mocks;
      } catch (e) {
        console.error('Failed to get mocks:', e);
      }
    }

    if (syncEnvs) {
      try {
        const envs = await App.sendToBackground('GET_ENVIRONMENTS');
        data.environments = maskSensitive
          ? Utils.maskSensitiveData(envs, this.getSensitiveKeys())
          : envs;
      } catch (e) {
        console.error('Failed to get environments:', e);
      }
    }

    return data;
  },

  getSensitiveKeys() {
    const input = document.getElementById('sensitiveKeys');
    if (!input) return ['password', 'token', 'secret', 'authorization', 'api_key'];
    
    return input.value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
  },

  async maskSensitiveData() {
    const sensitiveKeys = this.getSensitiveKeys();

    try {
      const [collections, environments] = await Promise.all([
        App.sendToBackground('GET_COLLECTIONS'),
        App.sendToBackground('GET_ENVIRONMENTS')
      ]);

      const maskedCollections = Utils.maskSensitiveData(collections, sensitiveKeys);
      const maskedEnvs = Utils.maskSensitiveData(environments, sensitiveKeys);

      const savePromises = [];
      
      for (const collection of maskedCollections) {
        savePromises.push(App.sendToBackground('SAVE_COLLECTION', collection));
      }
      
      for (const env of maskedEnvs) {
        savePromises.push(App.sendToBackground('SAVE_ENVIRONMENT', env));
      }
      
      await Promise.all(savePromises);

      App.showToast('已清理 ' + maskedCollections.length + ' 个集合和 ' + maskedEnvs.length + ' 个环境的敏感信息');
    } catch (e) {
      App.showToast('清理失败: ' + e, 'error');
    }
  },

  exportMaskedData() {
    const sensitiveKeys = this.getSensitiveKeys();
    const data = this.collectSyncData();
    const masked = Utils.maskSensitiveData(data, sensitiveKeys);

    Utils.downloadFile(
      JSON.stringify(masked, null, 2),
      `api-debugger-sync-${Date.now()}.json`
    );

    App.showToast('已导出脱敏数据');
  }
};

if (typeof window !== 'undefined') {
  window.SyncPanel = SyncPanel;
}
