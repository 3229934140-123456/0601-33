const RequestPanel = {
  currentRequest: {
    method: 'GET',
    url: '',
    headers: {},
    body: null,
    bodyType: 'none'
  },
  lastResponse: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const methodSelect = document.getElementById('requestMethod');
    if (methodSelect) {
      methodSelect.addEventListener('change', (e) => {
        this.currentRequest.method = e.target.value;
      });
    }

    const urlInput = document.getElementById('requestUrl');
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        this.currentRequest.url = e.target.value;
      });
    }

    const sendBtn = document.getElementById('sendRequestBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendRequest());
    }

    const sendBtn2 = document.getElementById('sendRequestBtn2');
    if (sendBtn2) {
      sendBtn2.addEventListener('click', () => this.sendRequest());
    }

    const addHeaderBtn = document.getElementById('addHeaderBtn');
    if (addHeaderBtn) {
      addHeaderBtn.addEventListener('click', () => this.addHeaderRow());
    }

    const addParamBtn = document.getElementById('addParamBtn');
    if (addParamBtn) {
      addParamBtn.addEventListener('click', () => this.addParamRow());
    }

    const bodyTypeSelect = document.getElementById('bodyTypeSelect');
    if (bodyTypeSelect) {
      bodyTypeSelect.addEventListener('change', (e) => {
        this.currentRequest.bodyType = e.target.value;
        const textarea = document.getElementById('bodyTextarea');
        if (textarea) {
          textarea.disabled = e.target.value === 'none';
        }
      });
    }

    const bodyTextarea = document.getElementById('bodyTextarea');
    if (bodyTextarea) {
      bodyTextarea.addEventListener('input', (e) => {
        this.currentRequest.body = e.target.value;
      });
    }

    const saveToCollectionBtn = document.getElementById('saveToCollectionBtn');
    if (saveToCollectionBtn) {
      saveToCollectionBtn.addEventListener('click', () => this.saveToCollection());
    }

    const headersEditor = document.getElementById('headersEditor');
    if (headersEditor) {
      headersEditor.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-row')) {
          e.target.closest('.header-row')?.remove();
        }
      });
    }

    const paramsEditor = document.getElementById('paramsEditor');
    if (paramsEditor) {
      paramsEditor.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-row')) {
          e.target.closest('.param-row')?.remove();
        }
      });
    }
  },

  addHeaderRow() {
    const editor = document.getElementById('headersEditor');
    if (!editor) return;

    const row = document.createElement('div');
    row.className = 'header-row';
    row.innerHTML = `
      <input type="text" class="header-key" placeholder="Header Key">
      <input type="text" class="header-value" placeholder="Header Value">
      <button class="btn-remove-row" title="删除">×</button>
    `;
    editor.appendChild(row);
  },

  addParamRow() {
    const editor = document.getElementById('paramsEditor');
    if (!editor) return;

    const row = document.createElement('div');
    row.className = 'param-row';
    row.innerHTML = `
      <input type="text" class="param-key" placeholder="参数名">
      <input type="text" class="param-value" placeholder="参数值">
      <button class="btn-remove-row" title="删除">×</button>
    `;
    editor.appendChild(row);
  },

  getHeaders() {
    const headers = {};
    const rows = document.querySelectorAll('#headersEditor .header-row');
    rows.forEach(row => {
      const keyInput = row.querySelector('.header-key');
      const valueInput = row.querySelector('.header-value');
      const key = keyInput?.value?.trim();
      const value = valueInput?.value?.trim();
      if (key && value) {
        headers[key] = value;
      }
    });
    return headers;
  },

  getParams() {
    const params = {};
    const rows = document.querySelectorAll('#paramsEditor .param-row');
    rows.forEach(row => {
      const keyInput = row.querySelector('.param-key');
      const valueInput = row.querySelector('.param-value');
      const key = keyInput?.value?.trim();
      const value = valueInput?.value?.trim();
      if (key) {
        params[key] = value || '';
      }
    });
    return params;
  },

  async sendRequest() {
    const url = this.currentRequest.url?.trim();
    if (!url) {
      App.showToast('请输入请求 URL', 'error');
      return;
    }

    const method = this.currentRequest.method;
    const headers = this.getHeaders();
    const params = this.getParams();
    let body = null;

    if (this.currentRequest.bodyType !== 'none' && this.currentRequest.body) {
      if (this.currentRequest.bodyType === 'json') {
        try {
          body = JSON.parse(this.currentRequest.body);
        } catch (e) {
          App.showToast('JSON 格式错误', 'error');
          return;
        }
      } else {
        body = this.currentRequest.body;
      }
    }

    let finalUrl = url;
    if (Object.keys(params).length > 0) {
      const urlObj = new URL(url);
      for (const [key, value] of Object.entries(params)) {
        urlObj.searchParams.append(key, value);
      }
      finalUrl = urlObj.toString();
    }

    try {
      const result = await App.sendToBackground('REPLAY_REQUEST', {
        url: finalUrl,
        method,
        headers,
        body
      });

      this.lastResponse = result;
      this.renderResponse(result);
      App.showToast('请求发送成功');

      const responseTab = document.querySelector('[data-tab="response"]');
      if (responseTab) {
        responseTab.click();
      }
    } catch (e) {
      App.showToast('请求失败: ' + e, 'error');
      this.renderError(e);
    }
  },

  renderResponse(response) {
    const panel = document.getElementById('responsePanel');
    if (!panel) return;

    const statusClass = response.status >= 200 && response.status < 300 ? 'success' : 
                        response.status >= 500 ? 'error' : 'warning';

    let responseBodyHtml = '';
    if (response.responseBody) {
      if (typeof response.responseBody === 'object') {
        responseBodyHtml = `<div class="json-viewer">${App.renderJson(response.responseBody)}</div>`;
      } else {
        responseBodyHtml = `<div class="json-viewer">${App.escapeHtml(String(response.responseBody))}</div>`;
      }
    } else {
      responseBodyHtml = '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">无响应体</p>';
    }

    const responseHeadersHtml = this.renderHeaders(response.responseHeaders);

    panel.innerHTML = `
      <div class="response-status">
        <span class="response-status-code ${statusClass}">${response.status} ${response.statusText || ''}</span>
        <span class="response-status-text">${response.error ? response.error : ''}</span>
        <div class="response-meta">
          <span>耗时: ${Utils.formatDuration(response.duration || 0)}</span>
          <span>大小: ${Utils.formatBytes(response.responseSize || 0)}</span>
        </div>
      </div>

      <div class="detail-tabs" style="border-bottom: 1px solid var(--border-color); margin-bottom: 16px;">
        <div class="detail-tab active" data-response-tab="body">响应体</div>
        <div class="detail-tab" data-response-tab="headers">响应头</div>
      </div>

      <div class="detail-tab-content active" id="response-tab-body">
        ${responseBodyHtml}
      </div>

      <div class="detail-tab-content" id="response-tab-headers">
        ${responseHeadersHtml}
      </div>

      <div style="margin-top: 16px; display: flex; gap: 8px;">
        <button class="action-btn" onclick="RequestPanel.copyResponse()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          复制响应
        </button>
        <button class="action-btn" onclick="RequestPanel.copyCurl()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          复制 cURL
        </button>
      </div>
    `;

    panel.querySelectorAll('[data-response-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.responseTab;
        panel.querySelectorAll('[data-response-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        panel.querySelectorAll('.detail-tab-content').forEach(content => {
          content.classList.toggle('active', content.id === `response-tab-${tabName}`);
        });
      });
    });
  },

  renderError(error) {
    const panel = document.getElementById('responsePanel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="response-status">
        <span class="response-status-code error">Error</span>
        <span class="response-status-text">${App.escapeHtml(error.message || error)}</span>
      </div>
    `;
  },

  renderHeaders(headers) {
    if (!headers || Object.keys(headers).length === 0) {
      return '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">无头部信息</p>';
    }

    const html = Object.entries(headers).map(([key, value]) => `
      <div class="detail-row">
        <span class="detail-label">${App.escapeHtml(key)}</span>
        <span class="detail-value">${App.escapeHtml(String(value))}</span>
      </div>
    `).join('');

    return html;
  },

  async copyResponse() {
    if (!this.lastResponse || !this.lastResponse.responseBody) {
      App.showToast('没有响应可复制', 'error');
      return;
    }

    try {
      const text = typeof this.lastResponse.responseBody === 'string'
        ? this.lastResponse.responseBody
        : JSON.stringify(this.lastResponse.responseBody, null, 2);
      
      await Utils.copyToClipboard(text);
      App.showToast('响应已复制到剪贴板');
    } catch (e) {
      App.showToast('复制失败: ' + e, 'error');
    }
  },

  async copyCurl() {
    try {
      const curl = Utils.objectToCurl(
        this.currentRequest.url,
        this.currentRequest.method,
        this.getHeaders(),
        this.currentRequest.body
      );
      
      await Utils.copyToClipboard(curl);
      App.showToast('cURL 已复制到剪贴板');
    } catch (e) {
      App.showToast('复制失败: ' + e, 'error');
    }
  },

  saveToCollection() {
    const url = this.currentRequest.url?.trim();
    if (!url) {
      App.showToast('请先输入请求 URL', 'error');
      return;
    }
    App.switchPanel('docs');
    App.showToast('请选择或创建集合来保存此接口');
  },

  loadRequest(request) {
    this.currentRequest = {
      method: request.method || 'GET',
      url: request.url || '',
      headers: request.headers || {},
      body: request.requestBody || null,
      bodyType: request.requestBody ? 'json' : 'none'
    };

    const methodSelect = document.getElementById('requestMethod');
    if (methodSelect) methodSelect.value = this.currentRequest.method;

    const urlInput = document.getElementById('requestUrl');
    if (urlInput) urlInput.value = this.currentRequest.url;

    const bodyTypeSelect = document.getElementById('bodyTypeSelect');
    if (bodyTypeSelect) bodyTypeSelect.value = this.currentRequest.bodyType;

    const bodyTextarea = document.getElementById('bodyTextarea');
    if (bodyTextarea) {
      bodyTextarea.disabled = this.currentRequest.bodyType === 'none';
      if (this.currentRequest.body) {
        bodyTextarea.value = typeof this.currentRequest.body === 'string'
          ? this.currentRequest.body
          : JSON.stringify(this.currentRequest.body, null, 2);
      }
    }

    this.renderHeadersInEditor(this.currentRequest.headers);
  },

  renderHeadersInEditor(headers) {
    const editor = document.getElementById('headersEditor');
    if (!editor) return;

    const entries = Object.entries(headers || {});
    if (entries.length === 0) {
      editor.innerHTML = `
        <div class="header-row">
          <input type="text" class="header-key" placeholder="Header Key">
          <input type="text" class="header-value" placeholder="Header Value">
          <button class="btn-remove-row" title="删除">×</button>
        </div>
      `;
      return;
    }

    editor.innerHTML = entries.map(([key, value]) => `
      <div class="header-row">
        <input type="text" class="header-key" value="${App.escapeHtml(key)}">
        <input type="text" class="header-value" value="${App.escapeHtml(String(value))}">
        <button class="btn-remove-row" title="删除">×</button>
      </div>
    `).join('');
  }
};

if (typeof window !== 'undefined') {
  window.RequestPanel = RequestPanel;
}
