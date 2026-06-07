(function() {
  'use strict';

  const state = {
    mockRules: [],
    isMockEnabled: true
  };

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  const sendToBackground = (type, payload) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        resolve(response);
      });
    });
  };

  const parseHeaders = (headersStr) => {
    const headers = {};
    if (!headersStr) return headers;
    headersStr.split('\r\n').forEach(line => {
      const [name, ...valueParts] = line.split(':');
      if (name && valueParts.length) {
        headers[name.trim()] = valueParts.join(':').trim();
      }
    });
    return headers;
  };

  const matchUrlPattern = (url, pattern) => {
    if (!pattern) return false;
    if (pattern === url) return true;
    try {
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(url);
    } catch (e) {
      return false;
    }
  };

  const findMockRule = (url, method) => {
    if (!state.isMockEnabled || !state.mockRules || state.mockRules.length === 0) {
      return null;
    }
    for (const mock of state.mockRules) {
      if (!mock.enabled) continue;
      if (mock.method && mock.method.toUpperCase() !== method.toUpperCase()) continue;
      if (matchUrlPattern(url, mock.urlPattern)) {
        return mock;
      }
    }
    return null;
  };

  const createMockResponse = (mock) => {
    const status = mock.statusCode || 200;
    const statusText = mock.statusText || 'OK';
    const headers = mock.responseHeaders || { 'Content-Type': 'application/json' };
    const body = typeof mock.responseBody === 'string'
      ? mock.responseBody
      : JSON.stringify(mock.responseBody || {});

    return {
      status,
      statusText,
      headers,
      body,
      delay: mock.delay || 0,
      isMocked: true,
      mockId: mock.id,
      mockName: mock.name
    };
  };

  const reportCapturedRequest = (requestData) => {
    chrome.runtime.sendMessage({
      type: 'REQUEST_CAPTURED',
      payload: requestData
    });
  };

  const loadMockRules = async () => {
    try {
      const response = await sendToBackground('GET_MOCKS');
      if (response && response.success && response.data) {
        state.mockRules = response.data;
      }
    } catch (e) {
      console.warn('[API Debugger] 加载 Mock 规则失败:', e);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await sendToBackground('GET_SETTINGS');
      if (response && response.success && response.data) {
        state.isMockEnabled = response.data.mockEnabled !== false;
      }
    } catch (e) {
      console.warn('[API Debugger] 加载设置失败:', e);
    }
  };

  const initMockListener = () => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'MOCK_RULES_UPDATED') {
        state.mockRules = message.payload || [];
      } else if (message.type === 'MOCK_ENABLED_CHANGED') {
        state.isMockEnabled = message.payload;
      } else if (message.type === 'PING') {
        sendResponse({ pong: true });
      }
      return true;
    });
  };

  const interceptXHR = () => {
    const OriginalXHR = window.XMLHttpRequest;

    function PatchedXHR() {
      const xhr = new OriginalXHR();
      const requestData = {
        id: generateId(),
        type: 'xhr',
        startTime: Date.now(),
        headers: {},
        requestBody: null,
        isMocked: false
      };

      let mockResponse = null;
      let _method = 'GET';
      let _url = '';
      let _async = true;
      let _user = null;
      let _password = null;
      let _responseText = '';
      let _status = 0;
      let _statusText = '';
      let _readyState = 0;
      let _responseHeaders = '';
      let _eventListeners = {
        load: [],
        error: [],
        abort: [],
        readystatechange: [],
        loadend: [],
        loadstart: [],
        progress: []
      };

      const triggerEvent = (eventName) => {
        const listeners = _eventListeners[eventName] || [];
        listeners.forEach(fn => {
          try {
            fn.call(xhr, { type: eventName, target: xhr });
          } catch (e) {
            console.error(e);
          }
        });
        if (eventName === 'readystatechange' && typeof xhr.onreadystatechange === 'function') {
          try {
            xhr.onreadystatechange.call(xhr, { type: 'readystatechange', target: xhr });
          } catch (e) {
            console.error(e);
          }
        }
      };

      Object.defineProperty(xhr, 'readyState', {
        get: () => _readyState
      });
      Object.defineProperty(xhr, 'status', {
        get: () => _status
      });
      Object.defineProperty(xhr, 'statusText', {
        get: () => _statusText
      });
      Object.defineProperty(xhr, 'responseText', {
        get: () => _responseText
      });
      Object.defineProperty(xhr, 'response', {
        get: () => _responseText
      });

      const originalAddEventListener = xhr.addEventListener;
      xhr.addEventListener = function(event, callback) {
        if (_eventListeners[event]) {
          _eventListeners[event].push(callback);
        }
        if (originalAddEventListener) {
          return originalAddEventListener.apply(this, arguments);
        }
      };

      const originalOpen = xhr.open;
      xhr.open = function(method, url, async, user, password) {
        _method = method;
        _url = url;
        _async = async !== false;
        _user = user;
        _password = password;
        requestData.method = method;
        requestData.url = url;

        mockResponse = findMockRule(url, method);

        if (mockResponse) {
          _readyState = 1;
          triggerEvent('readystatechange');
          return;
        }

        return originalOpen.apply(this, arguments);
      };

      const originalSetRequestHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function(name, value) {
        requestData.headers[name] = value;
        if (mockResponse) {
          return;
        }
        return originalSetRequestHeader.apply(this, arguments);
      };

      const originalSend = xhr.send;
      xhr.send = function(body) {
        if (body) {
          try {
            requestData.requestBody = typeof body === 'string'
              ? (body.startsWith('{') || body.startsWith('[') ? JSON.parse(body) : body)
              : body;
          } catch (e) {
            requestData.requestBody = body;
          }
        }

        if (mockResponse) {
          const mockData = createMockResponse(mockResponse);
          requestData.isMocked = true;
          requestData.mockId = mockData.mockId;
          requestData.mockName = mockData.mockName;

          setTimeout(() => {
            _status = mockData.status;
            _statusText = mockData.statusText;
            _responseText = mockData.body;
            _responseHeaders = Object.entries(mockData.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\r\n');

            _readyState = 2;
            triggerEvent('readystatechange');
            triggerEvent('loadstart');

            _readyState = 3;
            triggerEvent('readystatechange');
            triggerEvent('progress');

            _readyState = 4;
            requestData.endTime = Date.now();
            requestData.duration = requestData.endTime - requestData.startTime;
            requestData.status = _status;
            requestData.statusText = _statusText;
            requestData.responseHeaders = mockData.headers;
            requestData.responseSize = mockData.body.length;

            try {
              const contentType = mockData.headers['content-type'] || mockData.headers['Content-Type'] || '';
              if (contentType.includes('application/json')) {
                try {
                  requestData.responseBody = JSON.parse(mockData.body);
                } catch {
                  requestData.responseBody = mockData.body;
                }
              } else {
                requestData.responseBody = mockData.body;
              }
            } catch (e) {
              requestData.responseBody = mockData.body;
            }

            triggerEvent('readystatechange');
            triggerEvent('load');
            triggerEvent('loadend');

            reportCapturedRequest(requestData);
          }, mockData.delay);

          return;
        }

        xhr.addEventListener('load', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.status = xhr.status;
          requestData.statusText = xhr.statusText;
          
          try {
            requestData.responseHeaders = parseHeaders(xhr.getAllResponseHeaders());
          } catch (e) {
            requestData.responseHeaders = {};
          }
          
          const contentType = requestData.responseHeaders['content-type'] || 
                              requestData.responseHeaders['Content-Type'] || '';
          requestData.contentType = contentType;

          let responseText = '';
          try {
            responseText = xhr.responseText || '';
          } catch (e) {
            responseText = '';
          }
          
          requestData.responseSize = responseText ? responseText.length : 0;

          if (responseText) {
            if (contentType.includes('application/json') || contentType.includes('+json')) {
              try {
                requestData.responseBody = JSON.parse(responseText);
              } catch {
                requestData.responseBody = responseText;
              }
            } else if (contentType.includes('text/') || contentType.includes('application/xml') || contentType.includes('application/javascript')) {
              requestData.responseBody = responseText;
            } else {
              requestData.responseBody = responseText.length < 10000 ? responseText : '[Response too large to display]';
            }
          } else {
            requestData.responseBody = null;
          }

          reportCapturedRequest(requestData);
        });

        xhr.addEventListener('error', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Network Error';
          reportCapturedRequest(requestData);
        });

        xhr.addEventListener('abort', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Aborted';
          reportCapturedRequest(requestData);
        });

        return originalSend.apply(this, arguments);
      };

      const originalGetAllResponseHeaders = xhr.getAllResponseHeaders;
      xhr.getAllResponseHeaders = function() {
        if (mockResponse) {
          return _responseHeaders;
        }
        return originalGetAllResponseHeaders.apply(this, arguments);
      };

      const originalGetResponseHeader = xhr.getResponseHeader;
      xhr.getResponseHeader = function(name) {
        if (mockResponse) {
          const headers = parseHeaders(_responseHeaders);
          return headers[name] || headers[name.toLowerCase()] || null;
        }
        return originalGetResponseHeader.apply(this, arguments);
      };

      return xhr;
    }

    PatchedXHR.prototype = OriginalXHR.prototype;
    PatchedXHR.DONE = 4;
    PatchedXHR.HEADERS_RECEIVED = 2;
    PatchedXHR.LOADING = 3;
    PatchedXHR.OPENED = 1;
    PatchedXHR.UNSENT = 0;
    window.XMLHttpRequest = PatchedXHR;
    window.XMLHttpRequest.DONE = 4;
    window.XMLHttpRequest.HEADERS_RECEIVED = 2;
    window.XMLHttpRequest.LOADING = 3;
    window.XMLHttpRequest.OPENED = 1;
    window.XMLHttpRequest.UNSENT = 0;
  };

  const interceptFetch = () => {
    const originalFetch = window.fetch;

    window.fetch = function(input, init) {
      const requestData = {
        id: generateId(),
        type: 'fetch',
        startTime: Date.now(),
        headers: {},
        requestBody: null,
        isMocked: false
      };

      let url, method;

      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
        method = input.method;
      }

      method = (init?.method || method || 'GET').toUpperCase();
      requestData.method = method;
      requestData.url = url;

      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            requestData.headers[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            requestData.headers[key] = value;
          });
        } else {
          requestData.headers = { ...init.headers };
        }
      } else if (input instanceof Request && input.headers) {
        input.headers.forEach((value, key) => {
          requestData.headers[key] = value;
        });
      }

      if (init?.body) {
        try {
          if (typeof init.body === 'string') {
            try {
              requestData.requestBody = JSON.parse(init.body);
            } catch {
              requestData.requestBody = init.body;
            }
          } else if (init.body instanceof FormData) {
            requestData.requestBody = '[FormData]';
          } else {
            try {
              requestData.requestBody = JSON.parse(init.body.toString());
            } catch {
              requestData.requestBody = '[Body]';
            }
          }
        } catch (e) {
          requestData.requestBody = null;
        }
      }

      const mockRule = findMockRule(url, method);

      if (mockRule) {
        const mockData = createMockResponse(mockRule);
        requestData.isMocked = true;
        requestData.mockId = mockData.mockId;
        requestData.mockName = mockData.mockName;

        return new Promise((resolve) => {
          setTimeout(() => {
            const responseBody = mockData.body;
            const initObj = {
              status: mockData.status,
              statusText: mockData.statusText,
              headers: mockData.headers,
              url: url
            };

            const response = new Response(responseBody, initObj);

            requestData.endTime = Date.now();
            requestData.duration = requestData.endTime - requestData.startTime;
            requestData.status = mockData.status;
            requestData.statusText = mockData.statusText;
            requestData.responseHeaders = mockData.headers;
            requestData.responseSize = responseBody.length;

            try {
              const contentType = mockData.headers['content-type'] || mockData.headers['Content-Type'] || '';
              if (contentType.includes('application/json')) {
                try {
                  requestData.responseBody = JSON.parse(responseBody);
                } catch {
                  requestData.responseBody = responseBody;
                }
              } else {
                requestData.responseBody = responseBody;
              }
            } catch (e) {
              requestData.responseBody = responseBody;
            }

            reportCapturedRequest(requestData);

            Object.defineProperty(response, '_isMocked', { value: true });
            Object.defineProperty(response, '_mockId', { value: mockData.mockId });

            resolve(response);
          }, mockData.delay);
        });
      }

      return originalFetch.apply(this, arguments).then(async (response) => {
        let clonedResponse;
        try {
          clonedResponse = response.clone();
        } catch (e) {
          requestData.error = 'Failed to clone response: ' + e.message;
          reportCapturedRequest(requestData);
          return response;
        }

        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.status = response.status;
        requestData.statusText = response.statusText;

        requestData.responseHeaders = {};
        try {
          if (response.headers && typeof response.headers.forEach === 'function') {
            response.headers.forEach((value, key) => {
              requestData.responseHeaders[key] = value;
            });
          }
        } catch (e) {
          // ignore header parsing errors
        }

        const contentType = (response.headers && response.headers.get) 
          ? (response.headers.get('content-type') || '') 
          : '';
        requestData.contentType = contentType;

        try {
          let bodyText = '';
          
          if (clonedResponse.body) {
            try {
              bodyText = await clonedResponse.text();
            } catch (textError) {
              try {
                const buffer = await clonedResponse.arrayBuffer();
                bodyText = '[Binary data: ' + buffer.byteLength + ' bytes]';
              } catch (bufferError) {
                bodyText = '[Response body not available]';
              }
            }
          }
          
          requestData.responseSize = bodyText ? bodyText.length : 0;

          if (bodyText && (contentType.includes('application/json') || contentType.includes('+json'))) {
            try {
              requestData.responseBody = JSON.parse(bodyText);
            } catch (parseError) {
              requestData.responseBody = bodyText;
            }
          } else if (bodyText) {
            if (contentType.includes('text/') || contentType.includes('application/xml') || contentType.includes('application/javascript')) {
              requestData.responseBody = bodyText;
            } else {
              requestData.responseBody = bodyText.length < 10000 ? bodyText : '[Response too large to display]';
            }
          } else {
            requestData.responseBody = null;
          }
        } catch (e) {
          requestData.responseBody = null;
          requestData.responseSize = 0;
          requestData.error = 'Failed to read response body: ' + e.message;
        }

        reportCapturedRequest(requestData);
        return response;
      }).catch((error) => {
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.error = error ? error.message : 'Unknown error';
        reportCapturedRequest(requestData);
        throw error;
      });
    };
  };

  const init = async () => {
    initMockListener();
    await Promise.all([
      loadMockRules(),
      loadSettings()
    ]);
    interceptXHR();
    interceptFetch();
  };

  try {
    init();
  } catch (e) {
    console.error('[API Debugger] 初始化失败:', e);
  }
})();
