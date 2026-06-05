(function() {
  // 1. Monkey-patch window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    const response = await originalFetch.apply(this, args);
    try {
      const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
      const match = urlStr.match(/\/challenges\/([^\/]+)\/auth/i);
      if (match) {
        if (response.status >= 200 && response.status < 300) {
          const challengeId = match[1];
          const challengeName = document.title || challengeId;
          
          try {
            alert('[INHACK] 드림핵 문제 풀이 성공이 감지되었습니다!\n문제 ID: ' + challengeId + '\n문제 이름: ' + challengeName);
          } catch (alertErr) {
            console.error('[INHACK Alert Error]', alertErr);
          }

          const event = new CustomEvent('DREAMHACK_CHALLENGE_SOLVED_EVENT', {
            detail: {
              challengeId: challengeId,
              challengeName: challengeName
            }
          });
          window.dispatchEvent(event);
        }
      }
    } catch (e) {
      console.warn('[INHACK Interceptor] Error parsing fetch response:', e);
    }
    return response;
  };

  // 2. Monkey-patch XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.apply(this, [method, url, ...rest]);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', async () => {
      try {
        const urlStr = this._url || '';
        const match = urlStr.match(/\/challenges\/([^\/]+)\/auth/i);
        if (match) {
          if (this.status >= 200 && this.status < 300) {
            const challengeId = match[1];
            const challengeName = document.title || challengeId;
            
            try {
              alert('[INHACK] 드림핵 문제 풀이 성공이 감지되었습니다!\n문제 ID: ' + challengeId + '\n문제 이름: ' + challengeName);
            } catch (alertErr) {
              console.error('[INHACK Alert Error]', alertErr);
            }

            const event = new CustomEvent('DREAMHACK_CHALLENGE_SOLVED_EVENT', {
              detail: {
                challengeId: challengeId,
                challengeName: challengeName
              }
            });
            window.dispatchEvent(event);
          }
        }
      } catch (e) {
        // Ignored
      }
    });
    return originalSend.apply(this, args);
  };
})();
