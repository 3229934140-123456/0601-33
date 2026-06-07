const EnvPanel = {
  environments: [],
  selectedEnv: null,
  currentEnvId: null,

  init() {
    this.bindEvents();
    this.loadEnvironments();
  },

  bindEvents() {
    const addBtn = document.getElementById('addEnvBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.createNewEnv());
    }
  },

  async loadEnvironments() {
    try {
      const [envs, currentId] = await Promise.all([
        App.sendToBackground('GET_ENVIRONMENTS'),
        App.sendToBackground('GET_CURRENT_ENV')
      ]);
      
      this.environments = envs;
      this.currentEnvId = currentId;
      this.renderEnvList();
    } catch (e) {
      console.error('Failed to load environments:', e);
    }
  },

  renderEnvList() {
    const listEl = document.getElementById('envList');
    if (!listEl) return;

    if (this.environments.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 40px 16px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <p>暂无环境配置</p>
        </div>
      `;
      return;
    }

    const html = this.environments.map(env => {
      const isSelected = this.selectedEnv?.id === env.id;
      const isCurrent = env.id === this.currentEnvId;

      return `
        <div class="env-list-item ${isSelected ? 'selected' : ''}" data-id="${env.id}">
          <div class="env-list-item-info">
            <div class="env-name">
              ${App.escapeHtml(env.name)}
              ${isCurrent ? '<span class="env-current-badge">当前</span>' : ''}
            </div>
            <div class="env-base-url" title="${App.escapeHtml(env.baseUrl || '')}">
              ${App.escapeHtml(env.baseUrl || '')}
            </div>
          </div>
          ${!isCurrent ? `
            <button class="action-btn" onclick="event.stopPropagation(); EnvPanel.setCurrent('${env.id}')" title="设为当前环境">
              使用
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.env-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const env = this.environments.find(e => e.id === id);
        this.selectEnv(env);
      });
    });
  },

  selectEnv(env) {
    this.selectedEnv = env;
    this.renderEnvList();
    this.renderEnvEditor();
  },

  createNewEnv() {
    const name = prompt('请输入环境名称:', '新环境');
    if (!name) return;

    const newEnv = {
      id: Utils.generateId(),
      name: name,
      baseUrl: '',
      headers: {},
      variables: {}
    };

    this.environments.push(newEnv);
    this.selectedEnv = newEnv;
    this.saveEnvironment(newEnv);
  },

  async setCurrent(envId) {
    try {
      await App.sendToBackground('SET_CURRENT_ENV', envId);
      this.currentEnvId = envId;
      this.renderEnvList();
      App.showToast('已切换环境');
    } catch (e) {
      App.showToast('切换失败: ' + e, 'error');
    }
  },

  renderEnvEditor() {
    const editorEl = document.getElementById('envEditor');
    if (!editorEl) return;

    if (!this.selectedEnv) {
      editorEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          <p>选择或创建环境</p>
        </div>
      `;
      return;
    }

    const env = this.selectedEnv;
    const headersText = Object.entries(env.headers || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    const variables = env.variables || {};
    const variablesHtml = Object.entries(variables).map(([key, value]) => `
      <div class="variable-row">
        <input type="text" class="variable-key" value="${App.escapeHtml(key)}" placeholder="变量名">
        <input type="text" class="variable-value" value="${App.escapeHtml(value)}" placeholder="变量值">
        <button class="btn-remove-row" title="删除">×</button>
      </div>
    `).join('');

    editorEl.innerHTML = `
      <div class="form-group">
        <label class="form-label">环境名称</label>
        <input type="text" class="form-input" id="envName" value="${App.escapeHtml(env.name || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">基础 URL</label>
        <input type="text" class="form-input" id="envBaseUrl" value="${App.escapeHtml(env.baseUrl || '')}" placeholder="https://api.example.com">
      </div>

      <div class="form-group">
        <label class="form-label">公共请求头（每行一个，格式：Key: Value）</label>
        <textarea class="form-textarea" id="envHeaders" rows="4" placeholder="Authorization: Bearer xxx">${App.escapeHtml(headersText)}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">环境变量</label>
        <div class="variables-editor" id="variablesEditor">
          ${variablesHtml || '<div class="variable-row"><input type="text" class="variable-key" placeholder="变量名"><input type="text" class="variable-value" placeholder="变量值"><button class="btn-remove-row" title="删除">×</button></div>'}
        </div>
        <button class="btn btn-text" id="addVariableBtn">+ 添加变量</button>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 20px;">
        <button class="btn btn-primary" id="saveEnvBtn">保存</button>
        <button class="btn btn-secondary" onclick="EnvPanel.setCurrent('${env.id}')">设为当前环境</button>
        ${this.environments.length > 1 ? '<button class="btn btn-danger" id="deleteEnvBtn">删除</button>' : ''}
      </div>
    `;

    this.bindEditorEvents();
  },

  bindEditorEvents() {
    const nameInput = document.getElementById('envName');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        if (this.selectedEnv) this.selectedEnv.name = e.target.value;
      });
    }

    const baseUrlInput = document.getElementById('envBaseUrl');
    if (baseUrlInput) {
      baseUrlInput.addEventListener('input', (e) => {
        if (this.selectedEnv) this.selectedEnv.baseUrl = e.target.value;
      });
    }

    const headersTextarea = document.getElementById('envHeaders');
    if (headersTextarea) {
      headersTextarea.addEventListener('input', (e) => {
        if (!this.selectedEnv) return;
        const headers = {};
        e.target.value.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            headers[key.trim()] = valueParts.join(':').trim();
          }
        });
        this.selectedEnv.headers = headers;
      });
    }

    const addVarBtn = document.getElementById('addVariableBtn');
    if (addVarBtn) {
      addVarBtn.addEventListener('click', () => {
        const editor = document.getElementById('variablesEditor');
        if (!editor) return;
        const row = document.createElement('div');
        row.className = 'variable-row';
        row.innerHTML = `
          <input type="text" class="variable-key" placeholder="变量名">
          <input type="text" class="variable-value" placeholder="变量值">
          <button class="btn-remove-row" title="删除">×</button>
        `;
        editor.appendChild(row);
      });
    }

    const variablesEditor = document.getElementById('variablesEditor');
    if (variablesEditor) {
      variablesEditor.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-row')) {
          e.target.closest('.variable-row')?.remove();
          this.collectVariables();
        }
      });

      variablesEditor.addEventListener('input', () => {
        this.collectVariables();
      });
    }

    const saveBtn = document.getElementById('saveEnvBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveEnvironment(this.selectedEnv));
    }

    const deleteBtn = document.getElementById('deleteEnvBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteEnvironment());
    }
  },

  collectVariables() {
    if (!this.selectedEnv) return;
    
    const variables = {};
    const rows = document.querySelectorAll('#variablesEditor .variable-row');
    rows.forEach(row => {
      const keyInput = row.querySelector('.variable-key');
      const valueInput = row.querySelector('.variable-value');
      const key = keyInput?.value?.trim();
      const value = valueInput?.value?.trim();
      if (key) {
        variables[key] = value || '';
      }
    });
    this.selectedEnv.variables = variables;
  },

  async saveEnvironment(env) {
    if (!env) return;

    if (!env.name) {
      App.showToast('请输入环境名称', 'error');
      return;
    }

    try {
      await App.sendToBackground('SAVE_ENVIRONMENT', env);
      this.loadEnvironments();
      App.showToast('环境已保存');
    } catch (e) {
      App.showToast('保存失败: ' + e, 'error');
    }
  },

  async deleteEnvironment() {
    if (!this.selectedEnv) return;

    if (this.environments.length <= 1) {
      App.showToast('至少保留一个环境', 'error');
      return;
    }

    if (!confirm('确定要删除这个环境吗？')) return;

    try {
      await App.sendToBackground('DELETE_ENVIRONMENT', this.selectedEnv.id);
      
      if (this.currentEnvId === this.selectedEnv.id) {
        const remaining = this.environments.filter(e => e.id !== this.selectedEnv.id);
        if (remaining.length > 0) {
          await App.sendToBackground('SET_CURRENT_ENV', remaining[0].id);
        }
      }

      this.selectedEnv = null;
      this.loadEnvironments();
      this.renderEnvEditor();
      App.showToast('环境已删除');
    } catch (e) {
      App.showToast('删除失败: ' + e, 'error');
    }
  }
};

if (typeof window !== 'undefined') {
  window.EnvPanel = EnvPanel;
}
