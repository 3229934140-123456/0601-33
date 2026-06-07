(function() {
  'use strict';

  if (window.__apiDebuggerInstalled__) return;
  window.__apiDebuggerInstalled__ = true;

  var _mockState = {
    mockRules: [],
    isMockEnabled: true
  };

  var _pageOrigin = location.origin;

  var _generateId = function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  };

  var _reportRequest = function(requestData) {
    window.postMessage({
      source: 'api-debugger-page',
      type: 'REQUEST_CAPTURED',
      payload: requestData
    }, '*');
  };

  var _resolveUrl = function(url) {
    if (!url) return url;
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
      return url;
    }
    try {
      return new URL(url, _pageOrigin).href;
    } catch (e) {
      return url;
    }
  };

  var _escapeRegExp = function(str) {
    return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  };

  var _matchUrlPattern = function(url, pattern) {
    if (!pattern) return false;
    if (pattern === url) return true;
    try {
      var regexPattern = _escapeRegExp(pattern)
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      var regex = new RegExp('^' + regexPattern + '$');
      return regex.test(url);
    } catch (e) {
      return false;
    }
  };

  var _findMockRule = function(url, method) {
    if (!_mockState.isMockEnabled || !_mockState.mockRules || _mockState.mockRules.length === 0) {
      return null;
    }
    var fullUrl = _resolveUrl(url);
    for (var i = 0; i < _mockState.mockRules.length; i++) {
      var mock = _mockState.mockRules[i];
      if (!mock.enabled) continue;
      if (mock.method && mock.method.toUpperCase() !== method.toUpperCase()) continue;
      if (_matchUrlPattern(fullUrl, mock.urlPattern) || _matchUrlPattern(url, mock.urlPattern)) {
        return mock;
      }
    }
    return null;
  };

  var _createMockResponse = function(mock) {
    var status = mock.statusCode || 200;
    var statusText = mock.statusText || 'OK';
    var headers = mock.responseHeaders || { 'Content-Type': 'application/json' };
    var body = typeof mock.responseBody === 'string'
      ? mock.responseBody
      : JSON.stringify(mock.responseBody || {});

    return {
      status: status,
      statusText: statusText,
      headers: headers,
      body: body,
      delay: mock.delay || 0,
      isMocked: true,
      mockId: mock.id,
      mockName: mock.name
    };
  };

  var _parseHeaders = function(headersStr) {
    var headers = {};
    if (!headersStr) return headers;
    var lines = headersStr.split('\r\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var idx = line.indexOf(':');
      if (idx > 0) {
        var name = line.substring(0, idx).trim();
        var value = line.substring(idx + 1).trim();
        headers[name] = value;
      }
    }
    return headers;
  };

  var _parseResponseBody = function(bodyText, contentType) {
    if (!bodyText) return null;
    var ct = contentType || '';
    if (ct.indexOf('application/json') !== -1 || ct.indexOf('+json') !== -1) {
      try {
        return JSON.parse(bodyText);
      } catch (e) {
        return bodyText;
      }
    } else if (ct.indexOf('text/') !== -1 || ct.indexOf('application/xml') !== -1 || ct.indexOf('application/javascript') !== -1) {
      return bodyText;
    } else {
      return bodyText.length < 10000 ? bodyText : '[Response too large to display]';
    }
  };

  var _interceptXHR = function() {
    var OriginalXHR = window.XMLHttpRequest;

    function PatchedXHR() {
      var xhr = new OriginalXHR();
      var requestData = {
        id: _generateId(),
        type: 'xhr',
        startTime: Date.now(),
        headers: {},
        requestBody: null,
        isMocked: false
      };

      var mockResponse = null;
      var _method = 'GET';
      var _url = '';
      var _async = true;
      var _responseText = '';
      var _status = 0;
      var _statusText = '';
      var _readyState = 0;
      var _responseHeaders = '';
      var _eventListeners = {
        load: [], error: [], abort: [], readystatechange: [],
        loadend: [], loadstart: [], progress: []
      };

      var triggerEvent = function(eventName) {
        var listeners = _eventListeners[eventName] || [];
        for (var i = 0; i < listeners.length; i++) {
          try {
            listeners[i].call(xhr, { type: eventName, target: xhr });
          } catch (e) {
            console.error(e);
          }
        }
        if (eventName === 'readystatechange' && typeof xhr.onreadystatechange === 'function') {
          try {
            xhr.onreadystatechange.call(xhr, { type: 'readystatechange', target: xhr });
          } catch (e) {
            console.error(e);
          }
        }
      };

      Object.defineProperty(xhr, 'readyState', { get: function() { return _readyState; } });
      Object.defineProperty(xhr, 'status', { get: function() { return _status; } });
      Object.defineProperty(xhr, 'statusText', { get: function() { return _statusText; } });
      Object.defineProperty(xhr, 'responseText', { get: function() { return _responseText; } });
      Object.defineProperty(xhr, 'response', { get: function() { return _responseText; } });

      var originalAddEventListener = xhr.addEventListener;
      xhr.addEventListener = function(event, callback) {
        if (_eventListeners[event]) {
          _eventListeners[event].push(callback);
        }
        if (originalAddEventListener) {
          return originalAddEventListener.apply(this, arguments);
        }
      };

      var originalOn = {};
      ['load', 'error', 'abort', 'readystatechange', 'loadend', 'loadstart', 'progress'].forEach(function(ev) {
        Object.defineProperty(xhr, 'on' + ev, {
          get: function() { return originalOn['on' + ev] || null; },
          set: function(fn) {
            originalOn['on' + ev] = fn;
            if (fn) _eventListeners[ev].push(fn);
          }
        });
      });

      var originalOpen = xhr.open;
      xhr.open = function(method, url, async, user, password) {
        _method = method;
        _url = url;
        _async = async !== false;
        requestData.method = method;
        requestData.url = url;

        mockResponse = _findMockRule(url, method);

        if (mockResponse) {
          _readyState = 1;
          triggerEvent('readystatechange');
          return;
        }

        return originalOpen.apply(this, arguments);
      };

      var originalSetRequestHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function(name, value) {
        requestData.headers[name] = value;
        if (mockResponse) return;
        return originalSetRequestHeader.apply(this, arguments);
      };

      var originalSend = xhr.send;
      xhr.send = function(body) {
        if (body) {
          try {
            if (typeof body === 'string') {
              try {
                requestData.requestBody = JSON.parse(body);
              } catch (e) {
                requestData.requestBody = body;
              }
            } else if (body instanceof FormData) {
              requestData.requestBody = '[FormData]';
            } else {
              requestData.requestBody = '[Body]';
            }
          } catch (e) {
            requestData.requestBody = body;
          }
        }

        if (mockResponse) {
          var mockData = _createMockResponse(mockResponse);
          requestData.isMocked = true;
          requestData.mockId = mockData.mockId;
          requestData.mockName = mockData.mockName;

          setTimeout(function() {
            _status = mockData.status;
            _statusText = mockData.statusText;
            _responseText = mockData.body;
            var headerPairs = [];
            for (var k in mockData.headers) {
              if (Object.prototype.hasOwnProperty.call(mockData.headers, k)) {
                headerPairs.push(k + ': ' + mockData.headers[k]);
              }
            }
            _responseHeaders = headerPairs.join('\r\n');

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
            requestData.responseBody = _parseResponseBody(mockData.body, mockData.headers['Content-Type'] || mockData.headers['content-type'] || '');

            triggerEvent('readystatechange');
            triggerEvent('load');
            triggerEvent('loadend');

            _reportRequest(requestData);
          }, mockData.delay);

          return;
        }

        var loadHandler = function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.status = xhr.status;
          requestData.statusText = xhr.statusText;

          try {
            requestData.responseHeaders = _parseHeaders(xhr.getAllResponseHeaders());
          } catch (e) {
            requestData.responseHeaders = {};
          }

          var contentType = requestData.responseHeaders['content-type'] ||
                            requestData.responseHeaders['Content-Type'] || '';
          requestData.contentType = contentType;

          var responseText = '';
          try {
            responseText = xhr.responseText || '';
          } catch (e) {
            responseText = '';
          }

          requestData.responseSize = responseText ? responseText.length : 0;
          requestData.responseBody = _parseResponseBody(responseText, contentType);

          _reportRequest(requestData);
        };

        var errorHandler = function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Network Error';
          _reportRequest(requestData);
        };

        var abortHandler = function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Aborted';
          _reportRequest(requestData);
        };

        xhr.addEventListener('load', loadHandler);
        xhr.addEventListener('error', errorHandler);
        xhr.addEventListener('abort', abortHandler);

        return originalSend.apply(this, arguments);
      };

      var originalGetAllResponseHeaders = xhr.getAllResponseHeaders;
      xhr.getAllResponseHeaders = function() {
        if (mockResponse) return _responseHeaders;
        return originalGetAllResponseHeaders.apply(this, arguments);
      };

      var originalGetResponseHeader = xhr.getResponseHeader;
      xhr.getResponseHeader = function(name) {
        if (mockResponse) {
          var headers = _parseHeaders(_responseHeaders);
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

  var _interceptFetch = function() {
    var originalFetch = window.fetch;

    window.fetch = function(input, init) {
      var requestData = {
        id: _generateId(),
        type: 'fetch',
        startTime: Date.now(),
        headers: {},
        requestBody: null,
        isMocked: false
      };

      var url, method;

      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
        method = input.method;
      }

      method = (init && init.method ? init.method : (method || 'GET')).toUpperCase();
      requestData.method = method;
      requestData.url = url;

      if (init && init.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach(function(value, key) {
            requestData.headers[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          for (var i = 0; i < init.headers.length; i++) {
            var h = init.headers[i];
            requestData.headers[h[0]] = h[1];
          }
        } else {
          for (var k in init.headers) {
            if (Object.prototype.hasOwnProperty.call(init.headers, k)) {
              requestData.headers[k] = init.headers[k];
            }
          }
        }
      } else if (input instanceof Request && input.headers) {
        input.headers.forEach(function(value, key) {
          requestData.headers[key] = value;
        });
      }

      if (init && init.body) {
        try {
          if (typeof init.body === 'string') {
            try {
              requestData.requestBody = JSON.parse(init.body);
            } catch (e) {
              requestData.requestBody = init.body;
            }
          } else if (init.body instanceof FormData) {
            requestData.requestBody = '[FormData]';
          } else {
            requestData.requestBody = '[Body]';
          }
        } catch (e) {
          requestData.requestBody = null;
        }
      }

      var mockRule = _findMockRule(url, method);

      if (mockRule) {
        var mockData = _createMockResponse(mockRule);
        requestData.isMocked = true;
        requestData.mockId = mockData.mockId;
        requestData.mockName = mockData.mockName;

        return new Promise(function(resolve) {
          setTimeout(function() {
            var responseBody = mockData.body;
            var initObj = {
              status: mockData.status,
              statusText: mockData.statusText,
              headers: mockData.headers,
              url: url
            };

            var response = new Response(responseBody, initObj);

            requestData.endTime = Date.now();
            requestData.duration = requestData.endTime - requestData.startTime;
            requestData.status = mockData.status;
            requestData.statusText = mockData.statusText;
            requestData.responseHeaders = mockData.headers;
            requestData.responseSize = responseBody.length;
            requestData.responseBody = _parseResponseBody(responseBody, mockData.headers['Content-Type'] || mockData.headers['content-type'] || '');

            _reportRequest(requestData);

            try {
              Object.defineProperty(response, '_isMocked', { value: true });
              Object.defineProperty(response, '_mockId', { value: mockData.mockId });
            } catch (e) {}

            resolve(response);
          }, mockData.delay);
        });
      }

      return originalFetch.apply(this, arguments).then(function(response) {
        var clonedResponse;
        try {
          clonedResponse = response.clone();
        } catch (e) {
          requestData.error = 'Failed to clone response: ' + e.message;
          _reportRequest(requestData);
          return response;
        }

        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.status = response.status;
        requestData.statusText = response.statusText;

        requestData.responseHeaders = {};
        try {
          if (response.headers && typeof response.headers.forEach === 'function') {
            response.headers.forEach(function(value, key) {
              requestData.responseHeaders[key] = value;
            });
          }
        } catch (e) {}

        var contentType = '';
        try {
          if (response.headers && response.headers.get) {
            contentType = response.headers.get('content-type') || '';
          }
        } catch (e) {}
        requestData.contentType = contentType;

        return clonedResponse.text().then(function(bodyText) {
          requestData.responseSize = bodyText ? bodyText.length : 0;
          requestData.responseBody = _parseResponseBody(bodyText, contentType);
          _reportRequest(requestData);
          return response;
        }).catch(function(e) {
          requestData.responseBody = null;
          requestData.responseSize = 0;
          requestData.error = 'Failed to read response body: ' + e.message;
          _reportRequest(requestData);
          return response;
        });
      }).catch(function(error) {
        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.error = error ? error.message : 'Unknown error';
        _reportRequest(requestData);
        throw error;
      });
    };
  };

  var _initMessageListener = function() {
    window.addEventListener('message', function(event) {
      if (!event.data || event.data.source !== 'api-debugger-content') return;

      var type = event.data.type;
      var payload = event.data.payload;

      if (type === 'MOCK_STATE_UPDATE') {
        _mockState.mockRules = payload.mockRules || [];
        _mockState.isMockEnabled = payload.isMockEnabled !== false;
      }
    });
  };

  _initMessageListener();
  _interceptXHR();
  _interceptFetch();

  window.postMessage({
    source: 'api-debugger-page',
    type: 'INTERCEPTOR_READY'
  }, '*');

})();
