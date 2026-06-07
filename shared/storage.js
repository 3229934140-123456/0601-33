const Storage = {
  KEYS: {
    REQUESTS: 'api_debugger_requests',
    ENVIRONMENTS: 'api_debugger_environments',
    CURRENT_ENV: 'api_debugger_current_env',
    COLLECTIONS: 'api_debugger_collections',
    FAVORITES: 'api_debugger_favorites',
    HISTORY: 'api_debugger_history',
    MOCKS: 'api_debugger_mocks',
    DOCS: 'api_debugger_docs',
    SETTINGS: 'api_debugger_settings',
    SYNC_CONFIG: 'api_debugger_sync_config'
  },

  async get(key, defaultValue = null) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    });
  },

  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  },

  async remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => resolve());
    });
  },

  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => resolve());
    });
  },

  async addRequest(request) {
    const requests = await this.get(this.KEYS.REQUESTS, []);
    requests.unshift(request);
    if (requests.length > 500) {
      requests.length = 500;
    }
    await this.set(this.KEYS.REQUESTS, requests);
    return request;
  },

  async getRequests(filter = {}) {
    let requests = await this.get(this.KEYS.REQUESTS, []);
    if (filter.url) {
      requests = requests.filter(r => r.url.includes(filter.url));
    }
    if (filter.method) {
      requests = requests.filter(r => r.method === filter.method);
    }
    if (filter.domain) {
      requests = requests.filter(r => r.url.startsWith(filter.domain));
    }
    return requests;
  },

  async clearRequests() {
    await this.set(this.KEYS.REQUESTS, []);
  },

  async getEnvironments() {
    return await this.get(this.KEYS.ENVIRONMENTS, [
      {
        id: 'default',
        name: '开发环境',
        baseUrl: 'http://localhost:3000',
        headers: {},
        variables: {}
      },
      {
        id: 'test',
        name: '测试环境',
        baseUrl: 'https://test-api.example.com',
        headers: {},
        variables: {}
      },
      {
        id: 'staging',
        name: '预发环境',
        baseUrl: 'https://staging-api.example.com',
        headers: {},
        variables: {}
      },
      {
        id: 'production',
        name: '生产环境',
        baseUrl: 'https://api.example.com',
        headers: {},
        variables: {}
      }
    ]);
  },

  async saveEnvironment(env) {
    const envs = await this.getEnvironments();
    const index = envs.findIndex(e => e.id === env.id);
    if (index >= 0) {
      envs[index] = { ...envs[index], ...env };
    } else {
      envs.push(env);
    }
    await this.set(this.KEYS.ENVIRONMENTS, envs);
    return env;
  },

  async deleteEnvironment(envId) {
    const envs = await this.getEnvironments();
    const filtered = envs.filter(e => e.id !== envId);
    await this.set(this.KEYS.ENVIRONMENTS, filtered);
  },

  async getCurrentEnv() {
    return await this.get(this.KEYS.CURRENT_ENV, 'default');
  },

  async setCurrentEnv(envId) {
    await this.set(this.KEYS.CURRENT_ENV, envId);
  },

  async getCollections() {
    return await this.get(this.KEYS.COLLECTIONS, []);
  },

  async saveCollection(collection) {
    const collections = await this.getCollections();
    const index = collections.findIndex(c => c.id === collection.id);
    if (index >= 0) {
      collections[index] = { ...collections[index], ...collection };
    } else {
      collections.push({
        id: collection.id || Date.now().toString(36),
        name: collection.name || '未命名集合',
        description: collection.description || '',
        apis: collection.apis || [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    await this.set(this.KEYS.COLLECTIONS, collections);
    return collection;
  },

  async deleteCollection(collectionId) {
    const collections = await this.getCollections();
    const filtered = collections.filter(c => c.id !== collectionId);
    await this.set(this.KEYS.COLLECTIONS, filtered);
  },

  async getFavorites() {
    return await this.get(this.KEYS.FAVORITES, []);
  },

  async addFavorite(api) {
    const favorites = await this.getFavorites();
    const exists = favorites.find(f => f.url === api.url && f.method === api.method);
    if (!exists) {
      favorites.unshift({
        id: Date.now().toString(36),
        ...api,
        favoritedAt: Date.now()
      });
      await this.set(this.KEYS.FAVORITES, favorites);
    }
    return favorites;
  },

  async removeFavorite(id) {
    const favorites = await this.getFavorites();
    const filtered = favorites.filter(f => f.id !== id);
    await this.set(this.KEYS.FAVORITES, filtered);
    return filtered;
  },

  async getMocks() {
    return await this.get(this.KEYS.MOCKS, []);
  },

  async saveMock(mock) {
    const mocks = await this.getMocks();
    const index = mocks.findIndex(m => m.id === mock.id);
    if (index >= 0) {
      mocks[index] = { ...mocks[index], ...mock, updatedAt: Date.now() };
    } else {
      mocks.unshift({
        id: mock.id || Date.now().toString(36),
        ...mock,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    await this.set(this.KEYS.MOCKS, mocks);
    return mock;
  },

  async deleteMock(mockId) {
    const mocks = await this.getMocks();
    const filtered = mocks.filter(m => m.id !== mockId);
    await this.set(this.KEYS.MOCKS, filtered);
  },

  async getDocs() {
    return await this.get(this.KEYS.DOCS, {});
  },

  async saveDoc(apiKey, doc) {
    const docs = await this.getDocs();
    docs[apiKey] = {
      ...docs[apiKey],
      ...doc,
      updatedAt: Date.now()
    };
    await this.set(this.KEYS.DOCS, docs);
    return docs[apiKey];
  },

  async getSettings() {
    return await this.get(this.KEYS.SETTINGS, {
      autoCapture: true,
      captureXhr: true,
      captureFetch: true,
      maxRequests: 500,
      showResponseSize: true,
      showDuration: true,
      theme: 'auto',
      sensitiveKeys: ['password', 'token', 'secret', 'authorization', 'api_key']
    });
  },

  async saveSettings(settings) {
    const current = await this.getSettings();
    await this.set(this.KEYS.SETTINGS, { ...current, ...settings });
  },

  async getSyncConfig() {
    return await this.get(this.KEYS.SYNC_CONFIG, {
      enabled: false,
      serverUrl: '',
      apiKey: '',
      teamId: '',
      autoSync: false,
      lastSyncTime: null
    });
  },

  async saveSyncConfig(config) {
    const current = await this.getSyncConfig();
    await this.set(this.KEYS.SYNC_CONFIG, { ...current, ...config });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
