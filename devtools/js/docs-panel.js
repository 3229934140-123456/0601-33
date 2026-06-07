const DocsPanel = {
  collections: [],
  selectedCollection: null,
  selectedApi: null,
  expandedCollections: new Set(),

  init() {
    this.bindEvents();
    this.loadCollections();
  },

  bindEvents() {
    const newBtn = document.getElementById('newCollectionBtn');
    if (newBtn) {
      newBtn.addEventListener('click', () => this.createNewCollection());
    }

    const importBtn = document.getElementById('importCollectionBtn');
    if (importBtn) {
      importBtn.addEventListener('click', () => this.importCollection());
    }
  },

  async loadCollections() {
    try {
      const collections = await App.sendToBackground('GET_COLLECTIONS');
      this.collections = collections;
      this.renderCollections();
    } catch (e) {
      console.error('Failed to load collections:', e);
    }
  },

  renderCollections() {
    const listEl = document.getElementById('collectionsList');
    if (!listEl) return;

    if (this.collections.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding: 40px 16px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>暂无接口集合</p>
          <p style="font-size: 11px; color: var(--text-tertiary);">点击新建集合开始管理</p>
        </div>
      `;
      return;
    }

    const html = this.collections.map(col => {
      const isExpanded = this.expandedCollections.has(col.id);
      const isSelected = this.selectedCollection?.id === col.id;
      
      let apisHtml = '';
      if (isExpanded && col.apis && col.apis.length > 0) {
        apisHtml = '<div class="api-list">' + col.apis.map(api => {
          const isApiSelected = this.selectedApi?.id === api.id;
          return `
            <div class="api-item ${isApiSelected ? 'selected' : ''}" data-api-id="${api.id}">
              <span class="api-method" style="color: ${Utils.getMethodColor(api.method)}">${api.method}</span>
              <span style="flex:1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${App.escapeHtml(api.name || Utils.getUrlPath(api.url))}</span>
            </div>
          `;
        }).join('') + '</div>';
      }

      return `
        <div class="collection-item ${isSelected ? 'selected' : ''}" data-collection-id="${col.id}">
          <div class="collection-item-header">
            <svg class="collection-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="collection-name">${App.escapeHtml(col.name)}</span>
            <span class="collection-count">${col.apis?.length || 0}</span>
          </div>
          ${apisHtml}
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.collection-item').forEach(item => {
      const header = item.querySelector('.collection-item-header');
      header.addEventListener('click', (e) => {
        const colId = item.dataset.collectionId;
        const col = this.collections.find(c => c.id === colId);
        this.toggleCollection(col);
      });
    });

    listEl.querySelectorAll('.api-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const apiId = item.dataset.apiId;
        this.selectApi(apiId);
      });
    });
  },

  toggleCollection(collection) {
    if (this.expandedCollections.has(collection.id)) {
      this.expandedCollections.delete(collection.id);
    } else {
      this.expandedCollections.add(collection.id);
      this.selectedCollection = collection;
    }
    this.renderCollections();
  },

  selectApi(apiId) {
    if (!this.selectedCollection) return;
    
    const api = this.selectedCollection.apis?.find(a => a.id === apiId);
    if (api) {
      this.selectedApi = api;
      this.renderCollections();
      this.renderApiDoc();
    }
  },

  createNewCollection() {
    const name = prompt('请输入集合名称:', '新集合');
    if (!name) return;

    const newCollection = {
      id: Utils.generateId(),
      name: name,
      description: '',
      apis: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.collections.push(newCollection);
    this.expandedCollections.add(newCollection.id);
    this.selectedCollection = newCollection;
    this.saveCollection(newCollection);
  },

  async saveCollection(collection) {
    try {
      await App.sendToBackground('SAVE_COLLECTION', collection);
      this.loadCollections();
      this.renderCollections();
      if (this.selectedCollection?.id === collection.id) {
        this.renderCollectionDetail();
      }
      App.showToast('集合已保存');
    } catch (e) {
      App.showToast('保存失败: ' + e, 'error');
    }
  },

  importCollection() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const collection = {
            id: Utils.generateId(),
            name: data.name || file.name.replace('.json', ''),
            description: data.description || '',
            apis: data.apis || [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          
          this.collections.push(collection);
          await this.saveCollection(collection);
          App.showToast('导入成功');
        } catch (err) {
          App.showToast('导入失败: 文件格式错误', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  renderCollectionDetail() {
    const contentEl = document.getElementById('docsContent');
    if (!contentEl) return;

    if (!this.selectedCollection) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>选择一个集合查看文档</p>
        </div>
      `;
      return;
    }

    const col = this.selectedCollection;

    contentEl.innerHTML = `
      <div class="doc-title">
        <input type="text" class="form-input" id="collectionNameInput" value="${App.escapeHtml(col.name)}" style="font-size: var(--font-size-xl); font-weight: 600; border: none; padding: 0; background: transparent;">
      </div>
      
      <div class="doc-section">
        <h4>描述</h4>
        <textarea class="form-textarea" id="collectionDescInput" placeholder="添加集合描述..." rows="3">${App.escapeHtml(col.description || '')}</textarea>
      </div>

      <div class="doc-section">
        <h4>接口列表 (${col.apis?.length || 0})</h4>
        <button class="btn btn-secondary btn-sm" id="addApiBtn" style="margin-bottom: 12px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          添加接口
        </button>
        <div id="apiListContainer"></div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 20px;">
        <button class="btn btn-primary" id="saveCollectionBtn">保存</button>
        <button class="btn btn-secondary" id="exportCollectionBtn">导出</button>
        <button class="btn btn-danger" id="deleteCollectionBtn">删除集合</button>
      </div>
    `;

    this.renderApiList();
    this.bindCollectionDetailEvents();
  },

  renderApiList() {
    const container = document.getElementById('apiListContainer');
    if (!container || !this.selectedCollection) return;

    const apis = this.selectedCollection.apis || [];

    if (apis.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-tertiary); font-size: var(--font-size-sm);">
          暂无接口，点击上方按钮添加
        </div>
      `;
      return;
    }

    container.innerHTML = apis.map(api => `
      <div class="history-item" data-api-id="${api.id}" style="cursor: pointer;">
        <span class="method-badge method-${api.method?.toLowerCase()}">${api.method || 'GET'}</span>
        <div class="history-item-info" style="flex:1;">
          <div class="history-item-url">${App.escapeHtml(api.name || Utils.getUrlPath(api.url))}</div>
          <div style="font-size: 11px; color: var(--text-tertiary); font-family: 'Monaco', monospace;">${App.escapeHtml(api.url || '')}</div>
        </div>
        <button class="action-btn" onclick="event.stopPropagation(); DocsPanel.editApi('${api.id}')">编辑</button>
        <button class="action-btn" style="color: var(--error-color);" onclick="event.stopPropagation(); DocsPanel.removeApi('${api.id}')">删除</button>
      </div>
    `).join('');

    container.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const apiId = item.dataset.apiId;
        this.selectApi(apiId);
      });
    });
  },

  bindCollectionDetailEvents() {
    const nameInput = document.getElementById('collectionNameInput');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        if (this.selectedCollection) {
          this.selectedCollection.name = e.target.value;
        }
      });
    }

    const descInput = document.getElementById('collectionDescInput');
    if (descInput) {
      descInput.addEventListener('input', (e) => {
        if (this.selectedCollection) {
          this.selectedCollection.description = e.target.value;
        }
      });
    }

    const addBtn = document.getElementById('addApiBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addApi());
    }

    const saveBtn = document.getElementById('saveCollectionBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (this.selectedCollection) {
          this.saveCollection(this.selectedCollection);
        }
      });
    }

    const exportBtn = document.getElementById('exportCollectionBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCollection());
    }

    const deleteBtn = document.getElementById('deleteCollectionBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteCollection());
    }
  },

  addApi() {
    if (!this.selectedCollection) return;

    const url = prompt('请输入接口 URL:', 'https://api.example.com/api/xxx');
    if (!url) return;

    const method = prompt('请输入请求方法 (GET/POST/PUT/DELETE):', 'GET')?.toUpperCase() || 'GET';
    const name = prompt('请输入接口名称:', Utils.getUrlPath(url)) || Utils.getUrlPath(url);

    const newApi = {
      id: Utils.generateId(),
      name,
      method,
      url,
      description: '',
      requestHeaders: {},
      requestBody: null,
      responseExample: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.selectedCollection.apis = this.selectedCollection.apis || [];
    this.selectedCollection.apis.push(newApi);
    this.selectedApi = newApi;
    
    this.saveCollection(this.selectedCollection);
  },

  editApi(apiId) {
    if (!this.selectedCollection) return;
    const api = this.selectedCollection.apis?.find(a => a.id === apiId);
    if (api) {
      this.selectedApi = api;
      this.renderApiDoc();
    }
  },

  removeApi(apiId) {
    if (!this.selectedCollection || !confirm('确定要删除这个接口吗？')) return;

    this.selectedCollection.apis = (this.selectedCollection.apis || []).filter(a => a.id !== apiId);
    if (this.selectedApi?.id === apiId) {
      this.selectedApi = null;
    }
    
    this.saveCollection(this.selectedCollection);
  },

  renderApiDoc() {
    const contentEl = document.getElementById('docsContent');
    if (!contentEl || !this.selectedApi) return;

    const api = this.selectedApi;
    const requestBodyStr = api.requestBody ? (typeof api.requestBody === 'string' ? api.requestBody : JSON.stringify(api.requestBody, null, 2)) : '';
    const responseStr = api.responseExample ? (typeof api.responseExample === 'string' ? api.responseExample : JSON.stringify(api.responseExample, null, 2)) : '';

    contentEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <button class="action-btn" onclick="DocsPanel.renderCollectionDetail()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
        <span class="method-badge method-${api.method?.toLowerCase()}">${api.method || 'GET'}</span>
        <input type="text" class="form-input" id="apiNameInput" value="${App.escapeHtml(api.name || '')}" style="flex: 1; font-size: var(--font-size-lg); font-weight: 600;">
      </div>

      <div class="form-group">
        <label class="form-label">接口 URL</label>
        <input type="text" class="form-input" id="apiUrlInput" value="${App.escapeHtml(api.url || '')}" style="font-family: 'Monaco', monospace;">
      </div>

      <div class="form-group">
        <label class="form-label">接口描述</label>
        <textarea class="form-textarea" id="apiDescInput" rows="2" placeholder="添加接口说明...">${App.escapeHtml(api.description || '')}</textarea>
      </div>

      <div class="detail-tabs" style="margin-bottom: 16px;">
        <div class="detail-tab active" data-doc-tab="request">请求参数</div>
        <div class="detail-tab" data-doc-tab="response">响应示例</div>
        <div class="detail-tab" data-doc-tab="notes">备注</div>
      </div>

      <div class="detail-tab-content active" id="doc-tab-request">
        <div class="form-group">
          <label class="form-label">请求头（每行一个，格式：Key: Value）</label>
          <textarea class="form-textarea" id="apiReqHeaders" rows="4" placeholder="Content-Type: application/json">${this.headersToText(api.requestHeaders)}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">请求体示例（JSON）</label>
          <textarea class="form-textarea" id="apiReqBody" rows="8" placeholder='{"key": "value"}'>${App.escapeHtml(requestBodyStr)}</textarea>
        </div>
      </div>

      <div class="detail-tab-content" id="doc-tab-response">
        <div class="form-group">
          <label class="form-label">响应示例（JSON）</label>
          <textarea class="form-textarea" id="apiResExample" rows="12" placeholder='{"code": 0, "message": "success"}'>${App.escapeHtml(responseStr)}</textarea>
          <div style="margin-top: 8px;">
            <button class="btn btn-secondary btn-sm" id="genSampleBtn">生成示例数据</button>
            <button class="btn btn-secondary btn-sm" id="validateFieldsBtn">校验字段</button>
          </div>
        </div>
        <div id="validationResult" style="display: none;"></div>
      </div>

      <div class="detail-tab-content" id="doc-tab-notes">
        <textarea class="form-textarea" id="apiNotes" rows="10" placeholder="添加备注信息...">${App.escapeHtml(api.notes || '')}</textarea>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 20px;">
        <button class="btn btn-primary" id="saveApiBtn">保存</button>
        <button class="btn btn-secondary" id="testApiBtn">测试接口</button>
      </div>
    `;

    this.bindApiDocEvents();
  },

  bindApiDocEvents() {
    const nameInput = document.getElementById('apiNameInput');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        if (this.selectedApi) this.selectedApi.name = e.target.value;
      });
    }

    const urlInput = document.getElementById('apiUrlInput');
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        if (this.selectedApi) this.selectedApi.url = e.target.value;
      });
    }

    const descInput = document.getElementById('apiDescInput');
    if (descInput) {
      descInput.addEventListener('input', (e) => {
        if (this.selectedApi) this.selectedApi.description = e.target.value;
      });
    }

    const reqHeaders = document.getElementById('apiReqHeaders');
    if (reqHeaders) {
      reqHeaders.addEventListener('input', (e) => {
        if (!this.selectedApi) return;
        const headers = {};
        e.target.value.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            headers[key.trim()] = valueParts.join(':').trim();
          }
        });
        this.selectedApi.requestHeaders = headers;
      });
    }

    const reqBody = document.getElementById('apiReqBody');
    if (reqBody) {
      reqBody.addEventListener('input', (e) => {
        if (!this.selectedApi) return;
        try {
          this.selectedApi.requestBody = JSON.parse(e.target.value);
        } catch {
          this.selectedApi.requestBody = e.target.value;
        }
      });
    }

    const resExample = document.getElementById('apiResExample');
    if (resExample) {
      resExample.addEventListener('input', (e) => {
        if (!this.selectedApi) return;
        try {
          this.selectedApi.responseExample = JSON.parse(e.target.value);
        } catch {
          this.selectedApi.responseExample = e.target.value;
        }
      });
    }

    const notes = document.getElementById('apiNotes');
    if (notes) {
      notes.addEventListener('input', (e) => {
        if (this.selectedApi) this.selectedApi.notes = e.target.value;
      });
    }

    const genSampleBtn = document.getElementById('genSampleBtn');
    if (genSampleBtn) {
      genSampleBtn.addEventListener('click', () => this.generateSampleData());
    }

    const validateBtn = document.getElementById('validateFieldsBtn');
    if (validateBtn) {
      validateBtn.addEventListener('click', () => this.validateFields());
    }

    const saveBtn = document.getElementById('saveApiBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveApi());
    }

    const testBtn = document.getElementById('testApiBtn');
    if (testBtn) {
      testBtn.addEventListener('click', () => this.testApi());
    }

    document.querySelectorAll('[data-doc-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.docTab;
        document.querySelectorAll('[data-doc-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('#doc-tab-request, #doc-tab-response, #doc-tab-notes').forEach(content => {
          content.classList.toggle('active', content.id === `doc-tab-${tabName}`);
        });
      });
    });
  },

  headersToText(headers) {
    if (!headers || Object.keys(headers).length === 0) return '';
    return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  },

  generateSampleData() {
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

    const sampleData = Utils.generateMockData(sampleSchema);
    if (this.selectedApi) {
      this.selectedApi.responseExample = sampleData;
    }

    const resExample = document.getElementById('apiResExample');
    if (resExample) {
      resExample.value = JSON.stringify(sampleData, null, 2);
    }

    App.showToast('已生成示例数据');
  },

  validateFields() {
    if (!this.selectedApi || !this.selectedApi.responseExample) {
      App.showToast('请先提供响应示例', 'error');
      return;
    }

    const schema = {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'number' },
        message: { type: 'string' },
        data: { type: 'object' }
      }
    };

    const errors = Utils.validateFields(this.selectedApi.responseExample, schema);
    
    const resultEl = document.getElementById('validationResult');
    if (resultEl) {
      resultEl.style.display = 'block';
      
      if (errors.length === 0) {
        resultEl.innerHTML = `
          <div style="padding: 12px; background: #dcfce7; color: #166534; border-radius: var(--radius-md);">
            ✓ 字段校验通过，所有必填字段都存在
          </div>
        `;
      } else {
        resultEl.innerHTML = `
          <div style="padding: 12px; background: #fee2e2; color: #991b1b; border-radius: var(--radius-md);">
            发现 ${errors.length} 个问题：
            <ul style="margin-top: 8px; padding-left: 20px;">
              ${errors.map(e => `<li>${e.path}: ${e.message}</li>`).join('')}
            </ul>
          </div>
        `;
      }
    }
  },

  async saveApi() {
    if (!this.selectedCollection || !this.selectedApi) return;

    this.selectedApi.updatedAt = Date.now();
    
    const apiIndex = this.selectedCollection.apis.findIndex(a => a.id === this.selectedApi.id);
    if (apiIndex >= 0) {
      this.selectedCollection.apis[apiIndex] = this.selectedApi;
    }

    this.selectedCollection.updatedAt = Date.now();
    await this.saveCollection(this.selectedCollection);
  },

  testApi() {
    if (!this.selectedApi) return;

    App.switchPanel('request');
    
    if (typeof RequestPanel !== 'undefined') {
      RequestPanel.loadRequest({
        method: this.selectedApi.method,
        url: this.selectedApi.url,
        headers: this.selectedApi.requestHeaders,
        requestBody: this.selectedApi.requestBody
      });
    }
    
    App.showToast('已加载到请求面板');
  },

  async deleteCollection() {
    if (!this.selectedCollection) return;

    if (!confirm('确定要删除这个集合吗？所有接口都会被删除。')) return;

    try {
      await App.sendToBackground('DELETE_COLLECTION', this.selectedCollection.id);
      this.selectedCollection = null;
      this.selectedApi = null;
      this.expandedCollections.delete(this.selectedCollection?.id);
      this.loadCollections();
      this.renderCollectionDetail();
      App.showToast('集合已删除');
    } catch (e) {
      App.showToast('删除失败: ' + e, 'error');
    }
  },

  exportCollection() {
    if (!this.selectedCollection) return;

    Utils.downloadFile(
      JSON.stringify(this.selectedCollection, null, 2),
      `${this.selectedCollection.name}.json`
    );

    App.showToast('导出成功');
  },

  refreshDoc(data) {
    // 文档更新后的刷新逻辑
  }
};

if (typeof window !== 'undefined') {
  window.DocsPanel = DocsPanel;
}
