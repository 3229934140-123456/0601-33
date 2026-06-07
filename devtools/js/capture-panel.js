const CapturePanel = {
  requests: [],
  selectedRequest: null,
  filteredRequests: [],

  init() {
    this.bindEvents();
    this.loadRequests();
  },

  bindEvents() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(() => this.filterRequests(), 200));
    }

    const methodFilter = document.getElementById('methodFilter');
    if (methodFilter) {
      methodFilter.addEventListener('change', () => this.filterRequests());
    }

    const clearBtn = document.getElementById('clearRequestsBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllRequests());
    }

    const exportBtn = document.getElementById('exportRequestsBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportRequests());
    }
  },

  async loadRequests() {
    try {
      const requests = await App.sendToBackground('GET_REQUESTS', {
        tabId: App.tabId
      });
      this.requests = requests;
      this.filterRequests();
    } catch (e) {
      console.error('Failed to load requests:', e);
    }
  },

  addRequest(request) {
    if (request.tabId !== App.tabId && request.tabId !== -1) return;
    
    this.requests.unshift(request);
    if (this.requests.length > 500) {
      this.requests.length = 500;
    }
    this.filterRequests();

    const autoScroll = document.getElementById('autoScroll')?.checked;
    if (autoScroll) {
      const listEl = document.getElementById('requestList');
      if (listEl) {
        listEl.scrollTop = 0;
      }
    }
  },

  filterRequests() {
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    const methodFilter = document.getElementById('methodFilter')?.value || '';

    this.filteredRequests = this.requests.filter(req => {
      const matchesSearch = !searchTerm || 
        req.url?.toLowerCase().includes(searchTerm) ||
        req.method?.toLowerCase().includes(searchTerm);
      
      const matchesMethod = !methodFilter || req.method === methodFilter;
      
      return matchesSearch && matchesMethod;
    });

    this.renderList();
  },

  renderList() {
    const listEl = document.getElementById('requestList');
    if (!listEl) return;

    if (this.filteredRequests.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="height: 200px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>暂无请求记录</p>
        </div>
      `;
      return;
    }

    const html = this.filteredRequests.map((req, index) => {
      const methodClass = `method-${req.method?.toLowerCase()}`;
      const statusClass = this.getStatusClass(req.status);
      const isSelected = this.selectedRequest?.id === req.id;
      const urlPath = Utils.getUrlPath(req.url);
      const mockBadge = req.isMocked ? '<span class="mock-badge" title="Mock 响应">Mock</span>' : '';

      return `
        <div class="request-item ${isSelected ? 'selected' : ''}" data-index="${index}" data-id="${req.id}">
          <div class="request-item-header">
            <span class="method-badge ${methodClass}">${req.method || 'GET'}</span>
            <span class="status-badge ${statusClass}">${req.status || 'pending'}</span>
            ${mockBadge}
            <span class="request-url" title="${App.escapeHtml(req.url)}">${App.escapeHtml(urlPath)}</span>
          </div>
          <div class="request-item-meta">
            <span>${Utils.formatTime(req.startTime || Date.now())}</span>
            <span>${Utils.formatDuration(req.duration || 0)}</span>
            <span>${Utils.formatBytes(req.responseSize || 0)}</span>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.request-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.selectRequest(this.filteredRequests[index]);
      });
    });
  },

  getStatusClass(status) {
    if (!status) return 'status-error';
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 300 && status < 400) return 'status-redirect';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return 'status-error';
  },

  selectRequest(request) {
    this.selectedRequest = request;
    this.renderList();
    this.renderDetail();
  },

  renderDetail() {
    const detailEl = document.getElementById('requestDetail');
    if (!detailEl || !this.selectedRequest) return;

    const req = this.selectedRequest;
    const urlPath = Utils.getUrlPath(req.url);
    const domain = Utils.getUrlDomain(req.url);
    const queryParams = Utils.parseQueryParams(req.url);
    const reqCookie = req.headers?.Cookie || req.headers?.cookie || '';
    const reqCookies = Utils.parseCookieHeader(reqCookie);
    const resContentType = req.responseHeaders?.['content-type'] || req.responseHeaders?.['Content-Type'] || '';
    const contentTypeInfo = Utils.parseContentType(resContentType);

    let requestBodyHtml = '';
    if (req.requestBody) {
      if (typeof req.requestBody === 'object') {
        requestBodyHtml = `<div class="json-viewer">${App.renderJsonTree(req.requestBody, true)}</div>`;
      } else {
        requestBodyHtml = `<div class="json-viewer">${App.escapeHtml(String(req.requestBody))}</div>`;
      }
    } else {
      requestBodyHtml = '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">无请求体</p>';
    }

    let responseBodyHtml = '';
    if (req.responseBody) {
      if (typeof req.responseBody === 'object') {
        responseBodyHtml = `
          <div style="margin-bottom: 8px; display: flex; gap: 8px; align-items: center;">
            <button class="action-btn" style="padding: 4px 8px; font-size: 11px;" onclick="CapturePanel.toggleAllJson(this)">展开/折叠全部</button>
          </div>
          <div class="json-viewer">${App.renderJsonTree(req.responseBody, true)}</div>
        `;
      } else {
        responseBodyHtml = `<div class="json-viewer">${App.escapeHtml(String(req.responseBody))}</div>`;
      }
    } else {
      responseBodyHtml = '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">无响应体</p>';
    }

    const requestHeadersHtml = this.renderHeaders(req.headers);
    const responseHeadersHtml = this.renderHeaders(req.responseHeaders);

    const queryParamsHtml = Object.keys(queryParams).length > 0
      ? this.renderKeyValuePairs(queryParams)
      : '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">无 Query 参数</p>';

    const cookieHtml = Object.keys(reqCookies).length > 0
      ? this.renderKeyValuePairs(reqCookies)
      : '<p style="color: var(--text-tertiary); font-size: var(--font-size-sm);">无 Cookie</p>';

    const contentTypeHtml = contentTypeInfo
      ? `<div class="detail-row"><span class="detail-label">MIME 类型</span><span class="detail-value">${contentTypeInfo.mimeType || '-'}</span></div>`
      : '';
    const charsetHtml = contentTypeInfo?.params?.charset
      ? `<div class="detail-row"><span class="detail-label">字符编码</span><span class="detail-value">${contentTypeInfo.params.charset}</span></div>`
      : '';
    const boundaryHtml = contentTypeInfo?.params?.boundary
      ? `<div class="detail-row"><span class="detail-label">Boundary</span><span class="detail-value">${contentTypeInfo.params.boundary}</span></div>`
      : '';

    const mockInfoHtml = req.isMocked
      ? `
        <div class="detail-row" style="background: #fef3c7; padding: 8px; border-radius: 4px; margin-bottom: 8px;">
          <span class="detail-label" style="font-weight: 600; color: #92400e;">Mock 响应</span>
          <span class="detail-value" style="color: #92400e; font-weight: 500;">
            ${req.mockName ? App.escapeHtml(req.mockName) : '已启用 Mock'}
          </span>
        </div>
      ` : '';

    const sourceLabel = req.type === 'replay' ? '重放请求' : (req.type === 'xhr' ? 'XHR' : 'Fetch');
    const sourceHtml = `
      <div class="detail-row">
        <span class="detail-label">来源</span>
        <span class="detail-value">${sourceLabel}</span>
      </div>
    `;

    detailEl.innerHTML = `
      <div class="detail-actions">
        <button class="action-btn primary" onclick="CapturePanel.replayRequest()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          重放
        </button>
        <button class="action-btn" onclick="CapturePanel.copyCurl()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          复制 cURL
        </button>
        <div class="detail-actions-dropdown">
          <button class="action-btn" onclick="CapturePanel.toggleCopyDropdown(event)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            复制响应 ▾
          </button>
          <div class="detail-actions-dropdown-menu" id="copyResponseDropdown">
            <div class="dropdown-item" onclick="CapturePanel.copyResponse('raw')">原始文本</div>
            <div class="dropdown-item" onclick="CapturePanel.copyResponse('pretty')">格式化 JSON</div>
          </div>
        </div>
        <button class="action-btn" onclick="CapturePanel.addToCollection()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          保存到集合
        </button>
        <button class="action-btn" onclick="CapturePanel.toggleFavorite()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          收藏
        </button>
      </div>

      <div class="detail-section" style="padding: 0 16px 16px;">
        <h4>请求信息</h4>
        ${mockInfoHtml}
        <div class="detail-row">
          <span class="detail-label">URL</span>
          <span class="detail-value">${App.escapeHtml(req.url)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">域名</span>
          <span class="detail-value">${App.escapeHtml(domain)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">方法</span>
          <span class="detail-value">${req.method}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">状态码</span>
          <span class="detail-value">${req.status || 'pending'} ${req.statusText || ''}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">耗时</span>
          <span class="detail-value">${Utils.formatDuration(req.duration || 0)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">响应大小</span>
          <span class="detail-value">${Utils.formatBytes(req.responseSize || 0)}</span>
        </div>
        ${sourceHtml}
        ${contentTypeHtml}
        ${charsetHtml}
        ${boundaryHtml}
        <div class="detail-row">
          <span class="detail-label">请求时间</span>
          <span class="detail-value">${Utils.formatTime(req.startTime || Date.now())}</span>
        </div>
      </div>

      <div class="detail-tabs">
        <div class="detail-tab active" data-tab="overview">概览</div>
        <div class="detail-tab" data-tab="query">Query 参数</div>
        <div class="detail-tab" data-tab="req-headers">请求头</div>
        <div class="detail-tab" data-tab="cookies">Cookie</div>
        <div class="detail-tab" data-tab="req-body">请求体</div>
        <div class="detail-tab" data-tab="res-headers">响应头</div>
        <div class="detail-tab" data-tab="res-body">响应体</div>
      </div>

      <div class="detail-tab-content active" id="detail-overview">
        <div class="detail-section" style="padding: 12px 16px;">
          <h4 style="margin-bottom: 12px;">请求摘要</h4>
          <div class="detail-row">
            <span class="detail-label">URL</span>
            <span class="detail-value" style="word-break: break-all;">${App.escapeHtml(req.url)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">方法</span>
            <span class="detail-value"><span class="method-badge method-${req.method?.toLowerCase()}">${req.method || 'GET'}</span></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Query 参数</span>
            <span class="detail-value">${Object.keys(queryParams).length} 个</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">请求头</span>
            <span class="detail-value">${Object.keys(req.headers || {}).length} 个</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">响应头</span>
            <span class="detail-value">${Object.keys(req.responseHeaders || {}).length} 个</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Cookie</span>
            <span class="detail-value">${Object.keys(reqCookies).length} 个</span>
          </div>
          ${req.isMocked ? `
            <div class="detail-row">
              <span class="detail-label">Mock 规则</span>
              <span class="detail-value" style="color: #d97706; font-weight: 500;">
                ${req.mockName ? App.escapeHtml(req.mockName) : '已命中'}
              </span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="detail-tab-content" id="detail-query">
        ${queryParamsHtml}
      </div>

      <div class="detail-tab-content" id="detail-req-headers">
        ${requestHeadersHtml}
      </div>

      <div class="detail-tab-content" id="detail-cookies">
        ${cookieHtml}
      </div>

      <div class="detail-tab-content" id="detail-req-body">
        ${requestBodyHtml}
      </div>

      <div class="detail-tab-content" id="detail-res-headers">
        ${responseHeadersHtml}
      </div>

      <div class="detail-tab-content" id="detail-res-body">
        ${responseBodyHtml}
      </div>
    `;

    detailEl.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        detailEl.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        detailEl.querySelectorAll('.detail-tab-content').forEach(content => {
          content.classList.toggle('active', content.id === `detail-${tabName}`);
        });
      });
    });
  },

  renderKeyValuePairs(obj) {
    if (!obj || Object.keys(obj).length === 0) {
      return '';
    }
    return Object.entries(obj).map(([key, value]) => `
      <div class="detail-row">
        <span class="detail-label">${App.escapeHtml(key)}</span>
        <span class="detail-value">${App.escapeHtml(String(value))}</span>
      </div>
    `).join('');
  },

  toggleCopyDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('copyResponseDropdown');
    if (dropdown) {
      dropdown.classList.toggle('show');
    }
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

  async replayRequest() {
    if (!this.selectedRequest) return;

    try {
      const result = await App.sendToBackground('REPLAY_REQUEST', {
        url: this.selectedRequest.url,
        method: this.selectedRequest.method,
        headers: this.selectedRequest.headers,
        body: this.selectedRequest.requestBody
      });

      App.showToast('请求重放成功');
      this.selectRequest(result);
    } catch (e) {
      App.showToast('重放失败: ' + e, 'error');
    }
  },

  async copyCurl() {
    if (!this.selectedRequest) return;

    try {
      const curl = Utils.objectToCurl(
        this.selectedRequest.url,
        this.selectedRequest.method,
        this.selectedRequest.headers || {},
        this.selectedRequest.requestBody
      );
      
      await Utils.copyToClipboard(curl);
      App.showToast('cURL 已复制到剪贴板');
    } catch (e) {
      App.showToast('复制失败: ' + e, 'error');
    }
  },

  async copyResponse(format = 'pretty') {
    if (!this.selectedRequest || !this.selectedRequest.responseBody) return;

    try {
      const respBody = this.selectedRequest.responseBody;
      let responseText;

      if (format === 'raw') {
        if (typeof respBody === 'string') {
          responseText = respBody;
        } else {
          responseText = JSON.stringify(respBody);
        }
      } else {
        if (typeof respBody === 'string') {
          try {
            responseText = JSON.stringify(JSON.parse(respBody), null, 2);
          } catch (e) {
            responseText = respBody;
          }
        } else {
          responseText = JSON.stringify(respBody, null, 2);
        }
      }

      await Utils.copyToClipboard(responseText);
      App.showToast('响应已复制到剪贴板');

      const dropdown = document.getElementById('copyResponseDropdown');
      if (dropdown) dropdown.classList.remove('show');
    } catch (e) {
      App.showToast('复制失败: ' + e, 'error');
    }
  },

  toggleAllJson(btn) {
    const detailEl = document.getElementById('requestDetail');
    if (!detailEl) return;

    const trees = detailEl.querySelectorAll('.json-tree');
    const hasClosed = Array.from(trees).some(t => !t.classList.contains('open'));

    trees.forEach(tree => {
      if (hasClosed) {
        tree.classList.add('open');
      } else {
        tree.classList.remove('open');
      }
    });
  },

  addToCollection() {
    if (!this.selectedRequest) return;
    App.openSaveToCollectionModal({
      url: this.selectedRequest.url,
      method: this.selectedRequest.method,
      headers: this.selectedRequest.headers || {},
      requestBody: this.selectedRequest.requestBody,
      responseBody: this.selectedRequest.responseBody,
      description: ''
    });
  },

  async toggleFavorite() {
    if (!this.selectedRequest) return;

    try {
      await App.sendToBackground('ADD_FAVORITE', {
        url: this.selectedRequest.url,
        method: this.selectedRequest.method,
        headers: this.selectedRequest.headers,
        requestBody: this.selectedRequest.requestBody,
        status: this.selectedRequest.status,
        responseBody: this.selectedRequest.responseBody
      });
      App.showToast('已添加到收藏');
    } catch (e) {
      App.showToast('操作失败: ' + e, 'error');
    }
  },

  async clearAllRequests() {
    if (!confirm('确定要清空所有请求记录吗？')) return;

    try {
      await App.sendToBackground('CLEAR_REQUESTS');
      this.requests = [];
      this.filteredRequests = [];
      this.selectedRequest = null;
      this.renderList();
      this.renderDetail();
      App.showToast('已清空请求记录');
    } catch (e) {
      App.showToast('清空失败: ' + e, 'error');
    }
  },

  clearRequests() {
    this.requests = [];
    this.filteredRequests = [];
    this.selectedRequest = null;
    this.renderList();
  },

  exportRequests() {
    if (this.filteredRequests.length === 0) {
      App.showToast('没有可导出的请求', 'error');
      return;
    }

    const data = {
      exportedAt: new Date().toISOString(),
      count: this.filteredRequests.length,
      requests: this.filteredRequests
    };

    Utils.downloadFile(
      JSON.stringify(data, null, 2),
      `api-requests-${Date.now()}.json`
    );

    App.showToast('导出成功');
  },

  refreshList() {
    this.filterRequests();
  }
};

if (typeof window !== 'undefined') {
  window.CapturePanel = CapturePanel;
}
