const MockPanel = {
  mocks: [],
  selectedMock: null,
  editingMock: null,

  init() {
    this.bindEvents();
    this.loadMocks();
  },

  bindEvents() {
    const addBtn = document.getElementById('addMockBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.createNewMock());
    }
  },

  async loadMocks() {
    try {
      const mocks = await App.sendToBackground('GET_MOCKS');
      this.mocks = mocks;
      this.renderMockList();
    } catch (e) {
      console.error('Failed to load mocks:', e);
    }
  },

  renderMockList() {
    const listEl = document.getElementById('mockList');
    if (!listEl) return;

    if (this.mocks.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="height: 200px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <p>暂无 Mock 规则</p>
          <p style="font-size: 11px;">点击右上角新建 Mock 规则</p>
        </div>
      `;
      return;
    }

    const html = this.mocks.map(mock => {
      const isSelected = this.selectedMock?.id === mock.id;
      const condCount = (Object.keys(mock.matchQuery || {}).length)
        + (Object.keys(mock.matchHeaders || {}).length)
        + (Object.keys(mock.matchBody || {}).length);
      return `
        <div class="mock-list-item ${isSelected ? 'selected' : ''}" data-id="${mock.id}">
          <div class="mock-item-title">
            ${App.escapeHtml(mock.name || '未命名 Mock')}
            ${condCount > 0 ? `<span class="cond-badge" title="${condCount} 个匹配条件">${condCount}</span>` : ''}
          </div>
          <div class="mock-item-url" title="${App.escapeHtml(mock.urlPattern || '')}">
            <span style="font-weight: 600; color: var(--primary-color); margin-right: 6px;">${mock.method || 'GET'}</span>
            ${App.escapeHtml(mock.urlPattern || '')}
          </div>
          <div class="mock-item-meta">
            <span class="mock-status ${mock.enabled ? '' : 'disabled'}">${mock.enabled ? '已启用' : '已禁用'}</span>
            <span style="font-size: 11px; color: var(--text-tertiary);">
              ${Utils.formatTime(mock.updatedAt || mock.createdAt || Date.now())}
            </span>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.mock-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const mock = this.mocks.find(m => m.id === id);
        this.selectMock(mock);
      });
    });
  },

  selectMock(mock) {
    this.selectedMock = mock;
    this.editingMock = Utils.deepClone(mock);
    this.renderMockList();
    this.renderMockEditor();
  },

  createNewMock() {
    const newMock = {
      id: Utils.generateId(),
      name: '新 Mock 规则',
      method: 'GET',
      urlPattern: '',
      enabled: true,
      statusCode: 200,
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: {
        code: 0,
        message: 'success',
        data: {}
      },
      delay: 0,
      description: '',
      matchQuery: {},
      matchHeaders: {},
      matchBody: {}
    };

    this.mocks.unshift(newMock);
    this.selectMock(newMock);
  },

  renderMockEditor() {
    const editorEl = document.getElementById('mockEditor');
    if (!editorEl) return;

    if (!this.editingMock) {
      editorEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <p>选择或创建 Mock 规则</p>
        </div>
      `;
      return;
    }

    const mock = this.editingMock;
    const responseBodyStr = typeof mock.responseBody === 'string'
      ? mock.responseBody
      : JSON.stringify(mock.responseBody, null, 2);

    const responseHeadersStr = Object.entries(mock.responseHeaders || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    editorEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
        <input type="text" class="form-input" id="mockName" value="${App.escapeHtml(mock.name || '')}" placeholder="Mock 名称" style="font-size: var(--font-size-lg); font-weight: 600;">
        <div class="mock-toggle ${mock.enabled ? 'active' : ''}" id="mockEnabled" title="启用/禁用"></div>
      </div>

      <div class="form-group">
        <label class="form-label">请求方法</label>
        <select class="form-input" id="mockMethod">
          <option value="GET" ${mock.method === 'GET' ? 'selected' : ''}>GET</option>
          <option value="POST" ${mock.method === 'POST' ? 'selected' : ''}>POST</option>
          <option value="PUT" ${mock.method === 'PUT' ? 'selected' : ''}>PUT</option>
          <option value="DELETE" ${mock.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
          <option value="PATCH" ${mock.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">URL 匹配规则（支持 * 通配符）</label>
        <input type="text" class="form-input" id="mockUrlPattern" value="${App.escapeHtml(mock.urlPattern || '')}" placeholder="https://api.example.com/users/*">
      </div>

      <div class="form-group">
        <label class="form-label" style="display: flex; align-items: center; justify-content: space-between;">
          <span>匹配条件 - Query 参数</span>
          <button class="btn btn-sm btn-secondary" id="addQueryCondBtn" type="button">+ 添加</button>
        </label>
        <div id="queryConditions" class="condition-list">
          ${this.renderConditionPairs(mock.matchQuery || {}, 'query')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="display: flex; align-items: center; justify-content: space-between;">
          <span>匹配条件 - 请求头</span>
          <button class="btn btn-sm btn-secondary" id="addHeaderCondBtn" type="button">+ 添加</button>
        </label>
        <div id="headerConditions" class="condition-list">
          ${this.renderConditionPairs(mock.matchHeaders || {}, 'header')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" style="display: flex; align-items: center; justify-content: space-between;">
          <span>匹配条件 - 请求体字段（JSON）</span>
          <button class="btn btn-sm btn-secondary" id="addBodyCondBtn" type="button">+ 添加</button>
        </label>
        <div id="bodyConditions" class="condition-list">
          ${this.renderConditionPairs(mock.matchBody || {}, 'body')}
        </div>
        <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">
          支持嵌套路径，如 user.id。值为 * 表示只要存在该字段即匹配。
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">响应状态码</label>
        <input type="number" class="form-input" id="mockStatusCode" value="${mock.statusCode || 200}" style="width: 120px;">
      </div>

      <div class="form-group">
        <label class="form-label">延迟响应（毫秒）</label>
        <input type="number" class="form-input" id="mockDelay" value="${mock.delay || 0}" style="width: 120px;">
        <span style="font-size: 11px; color: var(--text-tertiary); margin-left: 8px;">设置延迟模拟网络慢的情况</span>
      </div>

      <div class="form-group">
        <label class="form-label">响应头（每行一个，格式：Key: Value）</label>
        <textarea class="form-textarea" id="mockResponseHeaders" rows="4" placeholder="Content-Type: application/json">${App.escapeHtml(responseHeadersStr)}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">响应体（JSON）</label>
        <textarea class="form-textarea" id="mockResponseBody" rows="10" placeholder='{"code": 0, "message": "success"}'>${App.escapeHtml(responseBodyStr)}</textarea>
        <div class="variable-hints" style="margin-top: 8px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; font-size: 11px; color: var(--text-secondary); line-height: 1.8;">
          <div style="font-weight: 600; margin-bottom: 4px;">支持动态变量：</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{$timestamp}}</code> - 当前时间戳（秒）</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{$now}}</code> - 当前 ISO 时间</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{$randomId}}</code> - 随机 ID</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{$uuid}}</code> - UUID</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{$random(6)}}</code> - 指定长度随机数字</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{query.userId}}</code> - 读取 Query 参数</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{header.Authorization}}</code> - 读取请求头</div>
          <div><code style="background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px;">{{body.user.id}}</code> - 读取请求体字段</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">描述</label>
        <textarea class="form-textarea" id="mockDescription" rows="2" placeholder="Mock 规则的说明...">${App.escapeHtml(mock.description || '')}</textarea>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 20px;">
        <button class="btn btn-primary" id="saveMockBtn">保存</button>
        <button class="btn btn-secondary" id="generateMockBtn">生成示例数据</button>
        <button class="btn btn-danger" id="deleteMockBtn">删除</button>
      </div>
    `;

    this.bindEditorEvents();
  },

  renderConditionPairs(conditions, type) {
    const entries = Object.entries(conditions || {});
    if (entries.length === 0) {
      return `<div style="font-size: 11px; color: var(--text-tertiary); padding: 8px 0;">暂无条件，点击添加按钮配置</div>`;
    }
    return entries.map(([key, value], idx) => `
      <div class="condition-pair" data-type="${type}" data-idx="${idx}">
        <input type="text" class="form-input condition-key" value="${App.escapeHtml(key)}" placeholder="键名" style="flex: 1;">
        <span style="padding: 0 6px; color: var(--text-tertiary);">=</span>
        <input type="text" class="form-input condition-value" value="${App.escapeHtml(String(value))}" placeholder="值" style="flex: 1;">
        <button class="btn btn-sm btn-remove-cond" type="button" title="删除">×</button>
      </div>
    `).join('');
  },

  addCondition(type) {
    if (!this.editingMock) return;
    const mapKey = `match${type.charAt(0).toUpperCase() + type.slice(1)}`;
    if (!this.editingMock[mapKey]) this.editingMock[mapKey] = {};
    this.editingMock[mapKey]['newKey'] = '';
    this.refreshConditions(type);
  },

  refreshConditions(type) {
    const mapKey = `match${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const container = document.getElementById(`${type}Conditions`);
    if (container && this.editingMock) {
      container.innerHTML = this.renderConditionPairs(this.editingMock[mapKey] || {}, type);
      this.bindConditionEvents(type);
    }
  },

  bindConditionEvents(type) {
    const container = document.getElementById(`${type}Conditions`);
    if (!container || !this.editingMock) return;

    const mapKey = `match${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const pairs = container.querySelectorAll('.condition-pair');
    const oldKeys = Object.keys(this.editingMock[mapKey] || {});
    const newConditions = {};

    pairs.forEach((pair, idx) => {
      const keyInput = pair.querySelector('.condition-key');
      const valInput = pair.querySelector('.condition-value');
      const removeBtn = pair.querySelector('.btn-remove-cond');

      const oldKey = oldKeys[idx];
      if (oldKey !== undefined && keyInput.value === '' && oldKey !== 'newKey') {
        keyInput.value = oldKey;
        const oldVal = this.editingMock[mapKey][oldKey];
        if (oldVal !== undefined) valInput.value = String(oldVal);
      }

      keyInput.addEventListener('input', () => {
        this._rebuildConditions(type);
      });
      valInput.addEventListener('input', () => {
        this._rebuildConditions(type);
      });
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          const keys = Object.keys(this.editingMock[mapKey] || {});
          const keyToDelete = keys[idx];
          if (keyToDelete !== undefined) {
            delete this.editingMock[mapKey][keyToDelete];
            this.refreshConditions(type);
          }
        });
      }
    });
  },

  _rebuildConditions(type) {
    if (!this.editingMock) return;
    const mapKey = `match${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const container = document.getElementById(`${type}Conditions`);
    if (!container) return;

    const pairs = container.querySelectorAll('.condition-pair');
    const newConditions = {};
    pairs.forEach(pair => {
      const key = pair.querySelector('.condition-key').value.trim();
      const val = pair.querySelector('.condition-value').value;
      if (key) newConditions[key] = val;
    });
    this.editingMock[mapKey] = newConditions;
  },

  bindEditorEvents() {
    const nameInput = document.getElementById('mockName');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        if (this.editingMock) this.editingMock.name = e.target.value;
      });
    }

    const toggle = document.getElementById('mockEnabled');
    if (toggle) {
      toggle.addEventListener('click', () => {
        if (!this.editingMock) return;
        this.editingMock.enabled = !this.editingMock.enabled;
        toggle.classList.toggle('active', this.editingMock.enabled);
      });
    }

    const methodSelect = document.getElementById('mockMethod');
    if (methodSelect) {
      methodSelect.addEventListener('change', (e) => {
        if (this.editingMock) this.editingMock.method = e.target.value;
      });
    }

    const urlPatternInput = document.getElementById('mockUrlPattern');
    if (urlPatternInput) {
      urlPatternInput.addEventListener('input', (e) => {
        if (this.editingMock) this.editingMock.urlPattern = e.target.value;
      });
    }

    const statusCodeInput = document.getElementById('mockStatusCode');
    if (statusCodeInput) {
      statusCodeInput.addEventListener('input', (e) => {
        if (this.editingMock) this.editingMock.statusCode = parseInt(e.target.value) || 200;
      });
    }

    const delayInput = document.getElementById('mockDelay');
    if (delayInput) {
      delayInput.addEventListener('input', (e) => {
        if (this.editingMock) this.editingMock.delay = parseInt(e.target.value) || 0;
      });
    }

    const headersTextarea = document.getElementById('mockResponseHeaders');
    if (headersTextarea) {
      headersTextarea.addEventListener('input', (e) => {
        if (!this.editingMock) return;
        const headers = {};
        e.target.value.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            headers[key.trim()] = valueParts.join(':').trim();
          }
        });
        this.editingMock.responseHeaders = headers;
      });
    }

    const bodyTextarea = document.getElementById('mockResponseBody');
    if (bodyTextarea) {
      bodyTextarea.addEventListener('input', (e) => {
        if (!this.editingMock) return;
        try {
          this.editingMock.responseBody = JSON.parse(e.target.value);
        } catch {
          this.editingMock.responseBody = e.target.value;
        }
      });
    }

    const descTextarea = document.getElementById('mockDescription');
    if (descTextarea) {
      descTextarea.addEventListener('input', (e) => {
        if (this.editingMock) this.editingMock.description = e.target.value;
      });
    }

    const saveBtn = document.getElementById('saveMockBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveMock());
    }

    const generateBtn = document.getElementById('generateMockBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generateMockData());
    }

    const deleteBtn = document.getElementById('deleteMockBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteMock());
    }

    const addQueryBtn = document.getElementById('addQueryCondBtn');
    if (addQueryBtn) {
      addQueryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.addCondition('query');
      });
    }
    const addHeaderBtn = document.getElementById('addHeaderCondBtn');
    if (addHeaderBtn) {
      addHeaderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.addCondition('header');
      });
    }
    const addBodyBtn = document.getElementById('addBodyCondBtn');
    if (addBodyBtn) {
      addBodyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.addCondition('body');
      });
    }

    this.bindConditionEvents('query');
    this.bindConditionEvents('header');
    this.bindConditionEvents('body');
  },

  async saveMock() {
    if (!this.editingMock) return;

    if (!this.editingMock.name) {
      App.showToast('请输入 Mock 名称', 'error');
      return;
    }

    if (!this.editingMock.urlPattern) {
      App.showToast('请输入 URL 匹配规则', 'error');
      return;
    }

    try {
      await App.sendToBackground('SAVE_MOCK', this.editingMock);
      this.selectedMock = Utils.deepClone(this.editingMock);
      this.loadMocks();
      App.showToast('Mock 规则已保存');
    } catch (e) {
      App.showToast('保存失败: ' + e, 'error');
    }
  },

  async deleteMock() {
    if (!this.editingMock) return;

    if (!confirm('确定要删除这个 Mock 规则吗？')) return;

    try {
      await App.sendToBackground('DELETE_MOCK', this.editingMock.id);
      this.selectedMock = null;
      this.editingMock = null;
      this.loadMocks();
      this.renderMockEditor();
      App.showToast('Mock 规则已删除');
    } catch (e) {
      App.showToast('删除失败: ' + e, 'error');
    }
  },

  generateMockData() {
    if (!this.editingMock) return;

    const sampleSchema = {
      type: 'object',
      properties: {
        code: { type: 'number' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            createdAt: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  title: { type: 'string' },
                  price: { type: 'number' }
                }
              }
            }
          }
        }
      }
    };

    const mockData = Utils.generateMockData(sampleSchema);
    this.editingMock.responseBody = mockData;
    
    const bodyTextarea = document.getElementById('mockResponseBody');
    if (bodyTextarea) {
      bodyTextarea.value = JSON.stringify(mockData, null, 2);
    }

    App.showToast('已生成示例数据');
  },

  validateResponse(schema, data) {
    const errors = Utils.validateFields(data, schema);
    return errors;
  }
};

if (typeof window !== 'undefined') {
  window.MockPanel = MockPanel;
}
