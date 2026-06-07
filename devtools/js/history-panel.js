const HistoryPanel = {
  requests: [],
  favorites: [],
  compareSelection: [],
  maxHistory: 200,

  init() {
    this.bindEvents();
    this.loadHistory();
    this.loadFavorites();
  },

  bindEvents() {
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
      compareBtn.addEventListener('click', () => this.compareResponses());
    }

    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }
  },

  async loadHistory() {
    try {
      const requests = await App.sendToBackground('GET_REQUESTS');
      this.requests = requests.slice(0, this.maxHistory);
      this.renderHistoryList();
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  },

  async loadFavorites() {
    try {
      const favorites = await App.sendToBackground('GET_FAVORITES');
      this.favorites = favorites;
      this.renderFavoritesList();
    } catch (e) {
      console.error('Failed to load favorites:', e);
    }
  },

  addRequest(request) {
    this.requests.unshift(request);
    if (this.requests.length > this.maxHistory) {
      this.requests.length = this.maxHistory;
    }
    this.renderHistoryList();
  },

  renderHistoryList() {
    const listEl = document.getElementById('historyList');
    if (!listEl) return;

    if (this.requests.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="height: 200px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>暂无历史记录</p>
        </div>
      `;
      return;
    }

    const html = this.requests.map(req => {
      const isInCompare = this.compareSelection.some(s => s.id === req.id);
      
      return `
        <div class="history-item ${isInCompare ? 'compare-selected' : ''}" data-id="${req.id}">
          <span class="method-badge method-${req.method?.toLowerCase()}">${req.method || 'GET'}</span>
          <div class="history-item-info">
            <div class="history-item-url" title="${App.escapeHtml(req.url)}">${App.escapeHtml(Utils.getUrlPath(req.url))}</div>
            <div class="history-item-meta">
              <span>${Utils.formatTime(req.startTime || Date.now())}</span>
              <span>${req.status || 'pending'}</span>
              <span>${Utils.formatDuration(req.duration || 0)}</span>
            </div>
          </div>
          <button class="favorite-btn ${this.isFavorite(req) ? 'active' : ''}" onclick="event.stopPropagation(); HistoryPanel.toggleFavorite('${req.id}')" title="收藏">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${this.isFavorite(req) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </button>
          <button class="action-btn" onclick="event.stopPropagation(); HistoryPanel.addToCompare('${req.id}')" title="添加到比较">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const req = this.requests.find(r => r.id === id);
        this.viewRequestDetail(req);
      });
    });
  },

  renderFavoritesList() {
    const listEl = document.getElementById('favoritesList');
    if (!listEl) return;

    if (this.favorites.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="height: 200px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <p>暂无收藏</p>
          <p style="font-size: 11px; color: var(--text-tertiary);">从历史记录中收藏常用接口</p>
        </div>
      `;
      return;
    }

    const html = this.favorites.map(fav => `
      <div class="history-item" data-id="${fav.id}">
        <span class="method-badge method-${fav.method?.toLowerCase()}">${fav.method || 'GET'}</span>
        <div class="history-item-info">
          <div class="history-item-url" title="${App.escapeHtml(fav.url)}">${App.escapeHtml(fav.name || Utils.getUrlPath(fav.url))}</div>
          <div class="history-item-meta">
            <span style="font-family: 'Monaco', monospace;">${App.escapeHtml(fav.url)}</span>
          </div>
        </div>
        <button class="action-btn" onclick="event.stopPropagation(); HistoryPanel.sendToRequest('${fav.id}')" title="发送到请求面板">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
        <button class="favorite-btn active" onclick="event.stopPropagation(); HistoryPanel.removeFavorite('${fav.id}')" title="取消收藏">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      </div>
    `).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const fav = this.favorites.find(f => f.id === id);
        if (fav) {
          this.sendToRequest(id, true);
        }
      });
    });
  },

  isFavorite(req) {
    return this.favorites.some(f => f.url === req.url && f.method === req.method);
  },

  async toggleFavorite(reqId) {
    const req = this.requests.find(r => r.id === reqId);
    if (!req) return;

    const existingFav = this.favorites.find(f => f.url === req.url && f.method === req.method);
    
    if (existingFav) {
      await this.removeFavorite(existingFav.id);
    } else {
      try {
        await App.sendToBackground('ADD_FAVORITE', {
          url: req.url,
          method: req.method,
          headers: req.headers,
          requestBody: req.requestBody,
          status: req.status,
          responseBody: req.responseBody
        });
        App.showToast('已添加到收藏');
        this.loadFavorites();
        this.renderHistoryList();
      } catch (e) {
        App.showToast('操作失败: ' + e, 'error');
      }
    }
  },

  async removeFavorite(favId) {
    try {
      await App.sendToBackground('REMOVE_FAVORITE', favId);
      App.showToast('已取消收藏');
      this.loadFavorites();
      this.renderHistoryList();
    } catch (e) {
      App.showToast('操作失败: ' + e, 'error');
    }
  },

  addToCompare(reqId) {
    const req = this.requests.find(r => r.id === reqId);
    if (!req) return;

    const index = this.compareSelection.findIndex(s => s.id === reqId);
    if (index >= 0) {
      this.compareSelection.splice(index, 1);
    } else {
      if (this.compareSelection.length >= 2) {
        this.compareSelection.shift();
      }
      this.compareSelection.push(req);
    }

    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
      compareBtn.disabled = this.compareSelection.length < 2;
    }

    this.renderHistoryList();
  },

  compareResponses() {
    if (this.compareSelection.length < 2) {
      App.showToast('请选择两个请求进行比较', 'error');
      return;
    }

    const [req1, req2] = this.compareSelection;
    const resp1 = req1.responseBody;
    const resp2 = req2.responseBody;

    if (!resp1 || !resp2) {
      App.showToast('请求缺少响应数据，无法比较', 'error');
      return;
    }

    const differences = Utils.compareResponses(resp1, resp2);
    this.renderCompareResult(req1, req2, differences);

    const compareTab = document.querySelector('[data-history-tab="compare"]');
    if (compareTab) {
      compareTab.click();
    }
  },

  renderCompareResult(req1, req2, differences) {
    const panel = document.getElementById('comparePanel');
    if (!panel) return;

    const resp1Str = typeof req1.responseBody === 'string' 
      ? req1.responseBody 
      : JSON.stringify(req1.responseBody, null, 2);
    const resp2Str = typeof req2.responseBody === 'string'
      ? req2.responseBody
      : JSON.stringify(req2.responseBody, null, 2);

    let diffHtml = '';
    if (differences.length === 0) {
      diffHtml = `
        <div style="padding: 20px; text-align: center; color: var(--success-color);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 12px;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p>两个响应完全相同</p>
        </div>
      `;
    } else {
      diffHtml = differences.map(diff => {
        let typeClass = 'modified';
        let prefix = '~';
        if (diff.type === 'added') {
          typeClass = 'added';
          prefix = '+';
        } else if (diff.type === 'removed') {
          typeClass = 'removed';
          prefix = '-';
        }

        let beforeStr = diff.before !== undefined ? JSON.stringify(diff.before) : '';
        let afterStr = diff.after !== undefined ? JSON.stringify(diff.after) : '';

        return `
          <div class="diff-item ${typeClass}">
            <strong>${prefix} ${diff.path || '(root)'}</strong>
            ${diff.type === 'value' || diff.type === 'modified' ? `
              <div style="margin-top: 4px; font-size: 11px; opacity: 0.8;">
                之前: ${beforeStr}<br>
                之后: ${afterStr}
              </div>
            ` : ''}
            ${diff.type === 'length' ? `
              <div style="margin-top: 4px; font-size: 11px; opacity: 0.8;">
                长度: ${diff.before} → ${diff.after}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    panel.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="font-size: var(--font-size-base); margin-bottom: 12px;">比较结果 (${differences.length} 处差异)</h3>
        <div class="compare-split" style="margin-bottom: 16px;">
          <div class="compare-side">
            <div class="compare-side-header">
              请求1 - ${req1.method} ${Utils.formatTime(req1.startTime)}
            </div>
            <div class="compare-side-body">
              <div class="json-viewer" style="font-size: 11px;">${App.renderJson(req1.responseBody)}</div>
            </div>
          </div>
          <div class="compare-side">
            <div class="compare-side-header">
              请求2 - ${req2.method} ${Utils.formatTime(req2.startTime)}
            </div>
            <div class="compare-side-body">
              <div class="json-viewer" style="font-size: 11px;">${App.renderJson(req2.responseBody)}</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 style="font-size: var(--font-size-sm); margin-bottom: 8px;">差异详情</h4>
        ${diffHtml}
      </div>
    `;
  },

  viewRequestDetail(req) {
    App.switchPanel('capture');
    if (typeof CapturePanel !== 'undefined') {
      CapturePanel.selectRequest(req);
    }
  },

  sendToRequest(favId, fromFavorites = false) {
    let req;
    if (fromFavorites) {
      req = this.favorites.find(f => f.id === favId);
    } else {
      req = this.requests.find(r => r.id === favId);
    }

    if (!req) return;

    App.switchPanel('request');
    if (typeof RequestPanel !== 'undefined') {
      RequestPanel.loadRequest(req);
    }
  },

  async clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) return;

    try {
      await App.sendToBackground('CLEAR_REQUESTS');
      this.requests = [];
      this.compareSelection = [];
      this.renderHistoryList();
      App.showToast('已清空历史记录');
    } catch (e) {
      App.showToast('清空失败: ' + e, 'error');
    }
  }
};

if (typeof window !== 'undefined') {
  window.HistoryPanel = HistoryPanel;
}
