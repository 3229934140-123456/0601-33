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
      var regex = new RegExp('^' + regexPattern + '$', 'i');
      return regex.test(url);
    } catch (e) {
      return false;
    }
  };

  var _findMockRule = function(url, method, requestInfo) {
    if (!_mockState.isMockEnabled || !_mockState.mockRules || _mockState.mockRules.length === 0) {
      return null;
    }
    var fullUrl = _resolveUrl(url);
    var info = requestInfo || {};
    if (!info.query) {
      info.query = _parseQueryParams(fullUrl);
    }

    var matchedRules = [];

    for (var i = 0; i < _mockState.mockRules.length; i++) {
      var mock = _mockState.mockRules[i];
      if (!mock.enabled) continue;
      if (mock.method && mock.method.toUpperCase() !== method.toUpperCase()) continue;
      if (!(_matchUrlPattern(fullUrl, mock.urlPattern) || _matchUrlPattern(url, mock.urlPattern))) continue;

      if (_checkMockConditions(mock, info)) {
        var conditionCount = 0;
        if (mock.matchQuery) conditionCount += Object.keys(mock.matchQuery).length;
        if (mock.matchHeaders) conditionCount += Object.keys(mock.matchHeaders).length;
        if (mock.matchBody) conditionCount += Object.keys(mock.matchBody).length;
        matchedRules.push({ rule: mock, priority: conditionCount, index: i });
      }
    }

    if (matchedRules.length === 0) return null;

    matchedRules.sort(function(a, b) {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.index - b.index;
    });
    return matchedRules[0].rule;
  };

  var _findMockRuleBasic = function(url, method) {
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

  var _normalizeHeaders = function(headers) {
    var result = {};
    if (!headers) return result;
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        result[key.toLowerCase()] = headers[key];
      }
    }
    return result;
  };

  var _getHeaderCaseInsensitive = function(headers, name) {
    if (!headers || !name) return null;
    return headers[name.toLowerCase()] || null;
  };

  var _headersToString = function(headers) {
    var lines = [];
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key)) {
        lines.push(key + ': ' + headers[key]);
      }
    }
    return lines.join('\r\n');
  };

  var _createMockResponse = function(mock, requestInfo) {
    var status = mock.statusCode || 200;
    var statusText = mock.statusText || 'OK';
    var rawHeaders = mock.responseHeaders || { 'Content-Type': 'application/json' };
    var rawBody = typeof mock.responseBody === 'string'
      ? mock.responseBody
      : JSON.stringify(mock.responseBody || {});

    var headers = {};
    for (var hk in rawHeaders) {
      if (Object.prototype.hasOwnProperty.call(rawHeaders, hk)) {
        headers[hk] = _renderMockTemplate(rawHeaders[hk], requestInfo);
      }
    }

    var body = _renderMockTemplate(rawBody, requestInfo);

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

  var _parseHeadersFromString = function(headersStr) {
    var headers = {};
    if (!headersStr) return headers;
    var lines = headersStr.split('\r\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      var idx = line.indexOf(':');
      if (idx > 0) {
        var name = line.substring(0, idx).trim();
        var value = line.substring(idx + 1).trim();
        headers[name] = value;
      }
    }
    return headers;
  };

  var _parseQueryParams = function(url) {
    var params = {};
    try {
      var u = new URL(url, _pageOrigin);
      u.searchParams.forEach(function(value, key) {
        if (params[key] !== undefined) {
          if (Array.isArray(params[key])) {
            params[key].push(value);
          } else {
            params[key] = [params[key], value];
          }
        } else {
          params[key] = value;
        }
      });
    } catch (e) {}
    return params;
  };

  var _parseJsonSafe = function(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  };

  var _getNestedValue = function(obj, path) {
    if (!obj || !path) return undefined;
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object') {
        var part = parts[i];
        var lowerKey = null;
        var keys = Object.keys(current);
        for (var j = 0; j < keys.length; j++) {
          if (keys[j].toLowerCase() === part.toLowerCase()) {
            lowerKey = keys[j];
            break;
          }
        }
        current = lowerKey ? current[lowerKey] : undefined;
      } else {
        return undefined;
      }
    }
    return current;
  };

  var _matchConditions = function(conditions, actual) {
    if (!conditions || Object.keys(conditions).length === 0) return true;
    if (!actual) return false;

    for (var key in conditions) {
      if (!Object.prototype.hasOwnProperty.call(conditions, key)) continue;
      var expected = conditions[key];
      var actualVal = _getNestedValue(actual, key);
      if (actualVal === undefined) return false;
      if (expected !== '*' && String(actualVal) !== String(expected)) return false;
    }
    return true;
  };

  var _checkMockConditions = function(mock, requestInfo) {
    if (!mock) return false;

    if (mock.matchQuery && Object.keys(mock.matchQuery).length > 0) {
      if (!_matchConditions(mock.matchQuery, requestInfo.query)) return false;
    }

    if (mock.matchHeaders && Object.keys(mock.matchHeaders).length > 0) {
      if (!_matchConditions(mock.matchHeaders, requestInfo.headers)) return false;
    }

    if (mock.matchBody && Object.keys(mock.matchBody).length > 0) {
      var bodyObj = requestInfo.body;
      if (typeof bodyObj === 'string') {
        bodyObj = _parseJsonSafe(bodyObj);
      }
      if (!_matchConditions(mock.matchBody, bodyObj)) return false;
    }

    return true;
  };

  var _renderMockTemplate = function(template, context) {
    if (!template || typeof template !== 'string') return template;

    var ctx = context || {};
    var query = ctx.query || {};
    var headers = ctx.headers || {};
    var body = ctx.body || {};

    var result = template;

    result = result.replace(/\{\{\s*\$timestamp\s*\}\}/g, function() {
      return Math.floor(Date.now() / 1000).toString();
    });
    result = result.replace(/\{\{\s*\$now\s*\}\}/g, function() {
      return new Date().toISOString();
    });
    result = result.replace(/\{\{\s*\$randomId\s*\}\}/g, function() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    });
    result = result.replace(/\{\{\s*\$random\((\d+)\)\s*\}\}/g, function(_, digits) {
      var len = parseInt(digits) || 6;
      var num = '';
      for (var i = 0; i < len; i++) {
        num += Math.floor(Math.random() * 10);
      }
      return num;
    });
    result = result.replace(/\{\{\s*\$uuid\s*\}\}/g, function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    });

    result = result.replace(/\{\{\s*query\.([\w.]+)\s*\}\}/g, function(_, key) {
      var val = _getNestedValue(query, key);
      return val !== undefined ? String(val) : '';
    });

    result = result.replace(/\{\{\s*header\.([\w.]+)\s*\}\}/gi, function(_, key) {
      var val = _getNestedValue(headers, key);
      return val !== undefined ? String(val) : '';
    });

    result = result.replace(/\{\{\s*body\.([\w.]+)\s*\}\}/g, function(_, key) {
      var val = _getNestedValue(body, key);
      return val !== undefined ? String(val) : '';
    });

    return result;
  };

  var _applyMockVariables = function(mockData, requestInfo) {
    var context = {
      query: requestInfo.query || {},
      headers: requestInfo.headers || {},
      body: requestInfo.body || {}
    };

    var result = {
      status: mockData.status,
      statusText: mockData.statusText,
      delay: mockData.delay,
      isMocked: true,
      mockId: mockData.mockId,
      mockName: mockData.mockName,
      headers: {},
      body: mockData.body
    };

    var origHeaders = mockData.headers || {};
    for (var hk in origHeaders) {
      if (Object.prototype.hasOwnProperty.call(origHeaders, hk)) {
        result.headers[hk] = _renderMockTemplate(origHeaders[hk], context);
      }
    }

    if (typeof mockData.body === 'string') {
      result.body = _renderMockTemplate(mockData.body, context);
    }

    return result;
  };

  var _interceptXHR = function() {
    var NativeXHR = window.XMLHttpRequest;

    function DebugXHR() {
      var nativeXhr = new NativeXHR();
      var requestData = {
        id: _generateId(),
        type: 'xhr',
        startTime: 0,
        headers: {},
        requestBody: null,
        isMocked: false
      };

      var mockRule = null;
      var mockData = null;

      var _isMockMode = false;
      var _opened = false;

      var _method = 'GET';
      var _url = '';
      var _responseType = '';

      var _mockReadyState = 0;
      var _mockStatus = 0;
      var _mockStatusText = '';
      var _mockResponseText = '';
      var _mockResponse = null;
      var _mockResponseHeadersStr = '';
      var _mockResponseHeaders = {};

      var _listeners = {};
      var _onProps = {};

      var _fireEvent = function(eventName) {
        var event = {
          type: eventName,
          target: xhr,
          currentTarget: xhr
        };

        var list = _listeners[eventName];
        if (list) {
          for (var i = 0; i < list.length; i++) {
            try {
              list[i].call(xhr, event);
            } catch (e) {
              setTimeout(function() { throw e; }, 0);
            }
          }
        }

        var handler = _onProps['on' + eventName];
        if (typeof handler === 'function') {
          try {
            handler.call(xhr, event);
          } catch (e) {
            setTimeout(function() { throw e; }, 0);
          }
        }
      };

      var _setMockReadyState = function(state) {
        _mockReadyState = state;
        _fireEvent('readystatechange');
      };

      var _applyMockResponse = function() {
        _mockStatus = mockData.status;
        _mockStatusText = mockData.statusText;
        _mockResponseText = mockData.body;
        _mockResponseHeadersStr = _headersToString(mockData.headers);
        _mockResponseHeaders = _normalizeHeaders(mockData.headers);

        var contentType = _getHeaderCaseInsensitive(_mockResponseHeaders, 'content-type') || '';

        if (_responseType === 'json') {
          try {
            _mockResponse = JSON.parse(mockData.body);
          } catch (e) {
            _mockResponse = null;
          }
        } else if (_responseType === 'text' || _responseType === '') {
          _mockResponse = mockData.body;
        } else {
          _mockResponse = mockData.body;
        }

        requestData.endTime = Date.now();
        requestData.duration = requestData.endTime - requestData.startTime;
        requestData.status = _mockStatus;
        requestData.statusText = _mockStatusText;
        requestData.responseHeaders = mockData.headers;
        requestData.responseSize = mockData.body.length;
        requestData.responseBody = _parseResponseBody(mockData.body, contentType);
        requestData.isMocked = true;
        requestData.mockId = mockData.mockId;
        requestData.mockName = mockData.mockName;

        _reportRequest(requestData);
      };

      var _runMock = function() {
        _isMockMode = true;

        setTimeout(function() {
          _setMockReadyState(2);
          _fireEvent('loadstart');
          _fireEvent('progress');
          _setMockReadyState(3);
          _fireEvent('progress');
          _applyMockResponse();
          _setMockReadyState(4);
          _fireEvent('load');
          _fireEvent('loadend');
        }, mockData.delay);
      };

      var xhr = Object.create(NativeXHR.prototype);

      xhr.open = function(method, url, async, user, password) {
        _method = method || 'GET';
        _url = url || '';
        _opened = true;
        requestData.method = _method;
        requestData.url = _url;

        var basicMatch = _findMockRuleBasic(_url, _method);
        if (basicMatch) {
          _isMockMode = true;
          _setMockReadyState(1);
          return;
        }

        return nativeXhr.open.apply(nativeXhr, arguments);
      };

      xhr.setRequestHeader = function(name, value) {
        requestData.headers[name] = value;
        if (_isMockMode) return;
        return nativeXhr.setRequestHeader.apply(nativeXhr, arguments);
      };

      xhr.send = function(body) {
        if (body !== undefined && body !== null) {
          try {
            if (typeof body === 'string') {
              try {
                requestData.requestBody = JSON.parse(body);
              } catch (e) {
                requestData.requestBody = body;
              }
            } else if (body instanceof FormData) {
              requestData.requestBody = '[FormData]';
            } else if (body instanceof Blob) {
              requestData.requestBody = '[Blob: ' + body.size + ' bytes]';
            } else {
              try {
                requestData.requestBody = body.toString();
              } catch (e) {
                requestData.requestBody = '[Body]';
              }
            }
          } catch (e) {
            requestData.requestBody = null;
          }
        }

        if (_isMockMode) {
          var requestInfo = {
            query: _parseQueryParams(_url),
            headers: requestData.headers,
            body: requestData.requestBody
          };

          mockRule = _findMockRule(_url, _method, requestInfo);
          if (!mockRule) {
            mockRule = _findMockRuleBasic(_url, _method);
          }

          if (mockRule) {
            mockData = _createMockResponse(mockRule, requestInfo);
            requestData.startTime = Date.now();
            _runMock();
          }
          return;
        }

        requestData.startTime = Date.now();

        nativeXhr.addEventListener('load', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.status = nativeXhr.status;
          requestData.statusText = nativeXhr.statusText;

          try {
            var headerStr = nativeXhr.getAllResponseHeaders();
            requestData.responseHeaders = _parseHeadersFromString(headerStr);
          } catch (e) {
            requestData.responseHeaders = {};
          }

          var contentType = '';
          try {
            contentType = nativeXhr.getResponseHeader('content-type') || '';
          } catch (e) {}
          requestData.contentType = contentType;

          var respText = '';
          try {
            respText = nativeXhr.responseText || '';
          } catch (e) {
            respText = '';
          }
          requestData.responseSize = respText ? respText.length : 0;
          requestData.responseBody = _parseResponseBody(respText, contentType);

          _reportRequest(requestData);
        });

        nativeXhr.addEventListener('error', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Network Error';
          _reportRequest(requestData);
        });

        nativeXhr.addEventListener('abort', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Aborted';
          _reportRequest(requestData);
        });

        nativeXhr.addEventListener('timeout', function() {
          requestData.endTime = Date.now();
          requestData.duration = requestData.endTime - requestData.startTime;
          requestData.error = 'Timeout';
          _reportRequest(requestData);
        });

        return nativeXhr.send.apply(nativeXhr, arguments);
      };

      xhr.abort = function() {
        if (_isMockMode) {
          _mockReadyState = 0;
          _mockStatus = 0;
          _fireEvent('abort');
          _fireEvent('loadend');
          return;
        }
        return nativeXhr.abort.apply(nativeXhr, arguments);
      };

      xhr.getAllResponseHeaders = function() {
        if (_isMockMode && _mockReadyState >= 2) {
          return _mockResponseHeadersStr;
        }
        return nativeXhr.getAllResponseHeaders.apply(nativeXhr, arguments);
      };

      xhr.getResponseHeader = function(name) {
        if (_isMockMode && _mockReadyState >= 2) {
          return _getHeaderCaseInsensitive(_mockResponseHeaders, name);
        }
        return nativeXhr.getResponseHeader.apply(nativeXhr, arguments);
      };

      xhr.overrideMimeType = function(mimetype) {
        if (_isMockMode) return;
        return nativeXhr.overrideMimeType.apply(nativeXhr, arguments);
      };

      xhr.addEventListener = function(type, listener, options) {
        if (!_listeners[type]) {
          _listeners[type] = [];
        }
        if (_listeners[type].indexOf(listener) === -1) {
          _listeners[type].push(listener);
        }
        if (_isMockMode) return;
        return nativeXhr.addEventListener.apply(nativeXhr, arguments);
      };

      xhr.removeEventListener = function(type, listener, options) {
        if (_listeners[type]) {
          var idx = _listeners[type].indexOf(listener);
          if (idx >= 0) {
            _listeners[type].splice(idx, 1);
          }
        }
        if (_isMockMode) return;
        return nativeXhr.removeEventListener.apply(nativeXhr, arguments);
      };

      Object.defineProperty(xhr, 'readyState', {
        get: function() {
          if (_isMockMode) return _mockReadyState;
          return nativeXhr.readyState;
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'status', {
        get: function() {
          if (_isMockMode && _mockReadyState >= 2) return _mockStatus;
          return nativeXhr.status;
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'statusText', {
        get: function() {
          if (_isMockMode && _mockReadyState >= 2) return _mockStatusText;
          return nativeXhr.statusText;
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'responseText', {
        get: function() {
          if (_isMockMode && _mockReadyState >= 3) return _mockResponseText;
          return nativeXhr.responseText;
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'response', {
        get: function() {
          if (_isMockMode && _mockReadyState >= 3) {
            return _mockResponse !== null ? _mockResponse : _mockResponseText;
          }
          return nativeXhr.response;
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'responseType', {
        get: function() {
          if (_isMockMode) return _responseType;
          return nativeXhr.responseType;
        },
        set: function(value) {
          _responseType = value;
          if (!_isMockMode) {
            try { nativeXhr.responseType = value; } catch (e) {}
          }
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'responseURL', {
        get: function() {
          if (_isMockMode) return _resolveUrl(_url);
          return nativeXhr.responseURL;
        },
        configurable: true
      });

      if (nativeXhr.upload) {
        Object.defineProperty(xhr, 'upload', {
          get: function() { return nativeXhr.upload; },
          configurable: true
        });
      }

      ['onreadystatechange', 'onloadstart', 'onprogress', 'onabort',
       'onerror', 'onload', 'ontimeout', 'onloadend'].forEach(function(prop) {
        Object.defineProperty(xhr, prop, {
          get: function() {
            return _onProps[prop] || null;
          },
          set: function(fn) {
            _onProps[prop] = fn;
            if (!_isMockMode) {
              try { nativeXhr[prop] = fn; } catch (e) {}
            }
          },
          configurable: true
        });
      });

      Object.defineProperty(xhr, 'timeout', {
        get: function() {
          if (_isMockMode) return 0;
          return nativeXhr.timeout;
        },
        set: function(value) {
          if (!_isMockMode) {
            nativeXhr.timeout = value;
          }
        },
        configurable: true
      });

      Object.defineProperty(xhr, 'withCredentials', {
        get: function() {
          if (_isMockMode) return false;
          return nativeXhr.withCredentials;
        },
        set: function(value) {
          if (!_isMockMode) {
            nativeXhr.withCredentials = value;
          }
        },
        configurable: true
      });

      return xhr;
    }

    DebugXHR.prototype = NativeXHR.prototype;
    DebugXHR.DONE = 4;
    DebugXHR.HEADERS_RECEIVED = 2;
    DebugXHR.LOADING = 3;
    DebugXHR.OPENED = 1;
    DebugXHR.UNSENT = 0;

    Object.defineProperty(DebugXHR, 'prototype', {
      value: NativeXHR.prototype,
      writable: false
    });

    window.XMLHttpRequest = DebugXHR;
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
          } else if (init.body instanceof Blob) {
            requestData.requestBody = '[Blob: ' + init.body.size + ' bytes]';
          } else {
            try {
              requestData.requestBody = init.body.toString();
            } catch (e) {
              requestData.requestBody = '[Body]';
            }
          }
        } catch (e) {
          requestData.requestBody = null;
        }
      }

      var requestInfo = {
        query: _parseQueryParams(url),
        headers: requestData.headers,
        body: requestData.requestBody
      };
      var mockRule = _findMockRule(url, method, requestInfo);

      if (mockRule) {
        var mockData = _createMockResponse(mockRule, requestInfo);
        requestData.isMocked = true;
        requestData.mockId = mockData.mockId;
        requestData.mockName = mockData.mockName;

        return new Promise(function(resolve) {
          setTimeout(function() {
            var responseBody = mockData.body;
            var headersObj = {};
            for (var hk in mockData.headers) {
              if (Object.prototype.hasOwnProperty.call(mockData.headers, hk)) {
                headersObj[hk] = mockData.headers[hk];
              }
            }

            var response;
            try {
              response = new Response(responseBody, {
                status: mockData.status,
                statusText: mockData.statusText,
                headers: headersObj,
                url: _resolveUrl(url)
              });
            } catch (e) {
              response = new Response(responseBody, {
                status: mockData.status,
                statusText: mockData.statusText
              });
            }

            requestData.endTime = Date.now();
            requestData.duration = requestData.endTime - requestData.startTime;
            requestData.status = mockData.status;
            requestData.statusText = mockData.statusText;
            requestData.responseHeaders = mockData.headers;
            requestData.responseSize = responseBody.length;

            var contentType = _getHeaderCaseInsensitive(
              _normalizeHeaders(mockData.headers),
              'content-type'
            ) || '';
            requestData.responseBody = _parseResponseBody(responseBody, contentType);

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
          try {
            return clonedResponse.arrayBuffer().then(function(buffer) {
              requestData.responseSize = buffer.byteLength;
              requestData.responseBody = '[Binary data: ' + buffer.byteLength + ' bytes]';
              _reportRequest(requestData);
              return response;
            });
          } catch (e2) {
            requestData.responseBody = null;
            requestData.responseSize = 0;
            requestData.error = 'Failed to read response body: ' + e.message;
            _reportRequest(requestData);
            return response;
          }
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
