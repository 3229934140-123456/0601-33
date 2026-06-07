const Utils = {
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  },

  parseJsonSafe(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  },

  stringifyJson(obj, pretty = true) {
    try {
      return JSON.stringify(obj, null, pretty ? 2 : 0);
    } catch (e) {
      return String(obj);
    }
  },

  headersToObject(headers) {
    if (Array.isArray(headers)) {
      const obj = {};
      headers.forEach(h => {
        obj[h.name] = h.value;
      });
      return obj;
    }
    return headers || {};
  },

  objectToHeaders(obj) {
    return Object.entries(obj || {}).map(([name, value]) => ({ name, value }));
  },

  getUrlPath(url) {
    try {
      const u = new URL(url);
      return u.pathname;
    } catch (e) {
      return url;
    }
  },

  getUrlDomain(url) {
    try {
      const u = new URL(url);
      return u.origin;
    } catch (e) {
      return '';
    }
  },

  getMethodColor(method) {
    const colors = {
      GET: '#22c55e',
      POST: '#3b82f6',
      PUT: '#f59e0b',
      DELETE: '#ef4444',
      PATCH: '#8b5cf6',
      HEAD: '#6b7280',
      OPTIONS: '#06b6d4'
    };
    return colors[method] || '#6b7280';
  },

  getStatusColor(status) {
    if (status >= 200 && status < 300) return '#22c55e';
    if (status >= 300 && status < 400) return '#3b82f6';
    if (status >= 400 && status < 500) return '#f59e0b';
    if (status >= 500) return '#ef4444';
    return '#6b7280';
  },

  debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (Array.isArray(obj)) return obj.map(item => this.deepClone(item));
    const result = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = this.deepClone(obj[key]);
      }
    }
    return result;
  },

  copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
  },

  downloadFile(content, filename, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  objectToCurl(url, method, headers, body) {
    let curl = `curl -X ${method} '${url}'`;
    if (headers && Object.keys(headers).length) {
      for (const [key, value] of Object.entries(headers)) {
        curl += ` \\\n  -H '${key}: ${value}'`;
      }
    }
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      curl += ` \\\n  -d '${bodyStr}'`;
    }
    return curl;
  },

  generateMockData(schema) {
    const generate = (sch) => {
      if (sch.type === 'object') {
        const obj = {};
        if (sch.properties) {
          for (const [key, prop] of Object.entries(sch.properties)) {
            obj[key] = generate(prop);
          }
        }
        return obj;
      }
      if (sch.type === 'array') {
        const arr = [];
        const len = sch.minItems || 3;
        for (let i = 0; i < len; i++) {
          arr.push(generate(sch.items || {}));
        }
        return arr;
      }
      if (sch.type === 'string') {
        if (sch.enum) return sch.enum[Math.floor(Math.random() * sch.enum.length)];
        if (sch.format === 'date-time') return new Date().toISOString();
        if (sch.format === 'email') return `user${Math.floor(Math.random() * 1000)}@example.com`;
        if (sch.format === 'uri') return `https://example.com/path/${Math.floor(Math.random() * 1000)}`;
        const len = sch.minLength || 5;
        return 'string'.repeat(Math.ceil(len / 6)).substring(0, len);
      }
      if (sch.type === 'number' || sch.type === 'integer') {
        const min = sch.minimum || 0;
        const max = sch.maximum || 100;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
      if (sch.type === 'boolean') {
        return Math.random() > 0.5;
      }
      if (sch.type === 'null') {
        return null;
      }
      return null;
    };
    return generate(schema);
  },

  validateFields(data, schema) {
    const errors = [];
    
    const validate = (value, sch, path = '') => {
      if (sch.type === 'object') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push({ path, message: `期望 object 类型`, expected: 'object', actual: typeof value });
          return;
        }
        if (sch.required) {
          for (const field of sch.required) {
            if (!(field in value)) {
              errors.push({ path: path ? `${path}.${field}` : field, message: `缺少必填字段 ${field}` });
            }
          }
        }
        if (sch.properties) {
          for (const [key, prop] of Object.entries(sch.properties)) {
            if (key in value) {
              validate(value[key], prop, path ? `${path}.${key}` : key);
            }
          }
        }
      } else if (sch.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push({ path, message: `期望 array 类型`, expected: 'array', actual: typeof value });
          return;
        }
        if (sch.items) {
          value.forEach((item, i) => {
            validate(item, sch.items, `${path}[${i}]`);
          });
        }
      } else if (sch.type === 'string') {
        if (typeof value !== 'string') {
          errors.push({ path, message: `期望 string 类型`, expected: 'string', actual: typeof value });
        }
      } else if (sch.type === 'number' || sch.type === 'integer') {
        if (typeof value !== 'number') {
          errors.push({ path, message: `期望 number 类型`, expected: 'number', actual: typeof value });
        }
      } else if (sch.type === 'boolean') {
        if (typeof value !== 'boolean') {
          errors.push({ path, message: `期望 boolean 类型`, expected: 'boolean', actual: typeof value });
        }
      }
    };
    
    validate(data, schema);
    return errors;
  },

  compareResponses(resp1, resp2) {
    const differences = [];
    
    const compare = (a, b, path = '') => {
      if (a === b) return;
      
      const typeA = typeof a;
      const typeB = typeof b;
      
      if (typeA !== typeB) {
        differences.push({ path, type: 'type', before: a, after: b });
        return;
      }
      
      if (a === null || b === null) {
        if (a !== b) {
          differences.push({ path, type: 'value', before: a, after: b });
        }
        return;
      }
      
      if (typeA === 'object') {
        const isArrayA = Array.isArray(a);
        const isArrayB = Array.isArray(b);
        
        if (isArrayA !== isArrayB) {
          differences.push({ path, type: 'type', before: isArrayA ? 'array' : 'object', after: isArrayB ? 'array' : 'object' });
          return;
        }
        
        if (isArrayA) {
          if (a.length !== b.length) {
            differences.push({ path, type: 'length', before: a.length, after: b.length });
          }
          const minLen = Math.min(a.length, b.length);
          for (let i = 0; i < minLen; i++) {
            compare(a[i], b[i], `${path}[${i}]`);
          }
        } else {
          const keysA = Object.keys(a);
          const keysB = Object.keys(b);
          const allKeys = new Set([...keysA, ...keysB]);
          
          for (const key of allKeys) {
            const newPath = path ? `${path}.${key}` : key;
            if (!(key in a)) {
              differences.push({ path: newPath, type: 'added', before: undefined, after: b[key] });
            } else if (!(key in b)) {
              differences.push({ path: newPath, type: 'removed', before: a[key], after: undefined });
            } else {
              compare(a[key], b[key], newPath);
            }
          }
        }
      } else {
        differences.push({ path, type: 'value', before: a, after: b });
      }
    };
    
    compare(resp1, resp2);
    return differences;
  },

  maskSensitiveData(data, sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'api_key', 'apikey']) {
    const mask = (value, key = '') => {
      if (value === null || value === undefined) return value;
      
      if (typeof value === 'string' && sensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        if (value.length <= 4) return '****';
        return value.substring(0, 2) + '****' + value.substring(value.length - 2);
      }
      
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return value.map(item => mask(item));
        }
        const result = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = mask(v, k);
        }
        return result;
      }
      
      return value;
    };
    
    return mask(data);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
