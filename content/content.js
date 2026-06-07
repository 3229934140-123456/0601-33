(function() {
  'use strict';

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  const sendToBackground = (data) => {
    chrome.runtime.sendMessage({
      type: 'REQUEST_CAPTURED',
      payload: data
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

  const interceptXHR = () => {
    const OriginalXHR = window.XMLHttpRequest;

    function PatchedXHR() {
      const xhr = new OriginalXHR();
      const requestData = {
        id: generateId(),
        type: 'xhr',
        startTime: Date.now(),
        headers: {},
        requestBody: null
      };

      const originalOpen = xhr.open;
      xhr.open = function(method, url) {
        requestData.method = method;
        requestData.url = url;
        return originalOpen.apply(this, arguments);
      };

      const originalSetRequestHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function(name, value) {
        requestData.headers[name] = value;
        return originalSetRequestHeader.apply(this, arguments);
      };

      const originalSend = xhr.send;
      xhr.send = function(body) {
        if (body) {
          try {
            requestData.requestBody = typeof body === 'string' ? (body.startsWith('{') || body.startsWith('[') ? JSON.parse(body) : body) : body;
          } catch (e) {
            requestData.requestBody = body;
          }
        }
        return originalSend.apply(this, arguments);
      };

      xhr.addEventListener('load', function() {
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.status = xhr.status;
        requestData.statusText = xhr.statusText;
        requestData.responseHeaders = parseHeaders(xhr.getAllResponseHeaders());
        requestData.responseSize = xhr.responseText ? xhr.responseText.length : 0;
        
        try {
          const contentType = requestData.responseHeaders['content-type'] || '';
          if (contentType.includes('application/json')) {
            requestData.responseBody = JSON.parse(xhr.responseText);
          } else {
            requestData.responseBody = xhr.responseText;
          }
        } catch (e) {
          requestData.responseBody = xhr.responseText;
        }

        sendToBackground(requestData);
      });

      xhr.addEventListener('error', function() {
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.error = 'Network Error';
        sendToBackground(requestData);
      });

      xhr.addEventListener('abort', function() {
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.error = 'Aborted';
        sendToBackground(requestData);
      });

      return xhr;
    }

    PatchedXHR.prototype = OriginalXHR.prototype;
    window.XMLHttpRequest = PatchedXHR;
    window.XMLHttpRequest.DONE = OriginalXHR.DONE;
    window.XMLHttpRequest.HEADERS_RECEIVED = OriginalXHR.HEADERS_RECEIVED;
    window.XMLHttpRequest.LOADING = OriginalXHR.LOADING;
    window.XMLHttpRequest.OPENED = OriginalXHR.OPENED;
    window.XMLHttpRequest.UNSENT = OriginalXHR.UNSENT;
  };

  const interceptFetch = () => {
    const originalFetch = window.fetch;

    window.fetch = function(input, init) {
      const requestData = {
        id: generateId(),
        type: 'fetch',
        startTime: Date.now(),
        headers: {},
        requestBody: null
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
      }

      if (init?.body) {
        try {
          if (typeof init.body === 'string') {
            try {
              requestData.requestBody = JSON.parse(init.body);
            } catch {
              requestData.requestBody = init.body;
            }
          } else {
            requestData.requestBody = init.body;
          }
        } catch (e) {
          // ignore
        }
      }

      return originalFetch.apply(this, arguments).then(async (response) => {
        const clonedResponse = response.clone();
        
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.status = response.status;
        requestData.statusText = response.statusText;
        
        response.headers.forEach((value, key) => {
          requestData.responseHeaders = requestData.responseHeaders || {};
          requestData.responseHeaders[key] = value;
        });

        try {
          const text = await clonedResponse.text();
          requestData.responseSize = text.length;
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            try {
              requestData.responseBody = JSON.parse(text);
            } catch {
              requestData.responseBody = text;
            }
          } else {
            requestData.responseBody = text;
          }
        } catch (e) {
          requestData.responseBody = null;
          requestData.responseSize = 0;
        }

        sendToBackground(requestData);
        return response;
      }).catch((error) => {
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.error = error.message;
        sendToBackground(requestData);
        throw error;
      });
    };
  };

  try {
    interceptXHR();
    interceptFetch();
  } catch (e) {
    console.error('[API Debugger] 拦截请求失败:', e);
  }
})();
