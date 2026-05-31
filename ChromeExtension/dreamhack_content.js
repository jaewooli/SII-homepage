// Content script running on https://dreamhack.io/*

// Inject page-level script to monkeypatch fetch & XHR to intercept wargame submissions
function injectScript() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // 1. Intercept Fetch API
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
          if (url && url.includes('/wargame/challenges/') && url.includes('/submit/')) {
            const clone = response.clone();
            const data = await clone.json();
            
            // Dreamhack correct response check
            if (data && data.correct === true) {
              const match = url.match(/\\/wargame\\/challenges\\/(\\d+)\\/?/);
              const challengeId = match ? match[1] : 'unknown';
              const challengeName = document.title ? document.title.split(' - ')[0].trim() : 'Unknown Challenge';
              
              window.dispatchEvent(new CustomEvent('DREAMHACK_CHALLENGE_SOLVED_EVENT', {
                detail: { challengeId, challengeName }
              }));
            }
          }
        } catch (e) {
          console.debug('[SII Extension] Intercept error:', e);
        }
        return response;
      };

      // 2. Intercept XMLHttpRequest API
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        this._method = method;
        return origOpen.apply(this, [method, url, ...args]);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
          try {
            const url = this._url;
            if (url && url.includes('/wargame/challenges/') && url.includes('/submit/') && this.status >= 200 && this.status < 300) {
              const data = JSON.parse(this.responseText);
              if (data && data.correct === true) {
                const match = url.match(/\\/wargame\\/challenges\\/(\\d+)\\/?/);
                const challengeId = match ? match[1] : 'unknown';
                const challengeName = document.title ? document.title.split(' - ')[0].trim() : 'Unknown Challenge';
                
                window.dispatchEvent(new CustomEvent('DREAMHACK_CHALLENGE_SOLVED_EVENT', {
                  detail: { challengeId, challengeName }
                }));
              }
            }
          } catch (e) {
            console.debug('[SII Extension] Intercept XHR error:', e);
          }
        });
        return origSend.apply(this, args);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// Start interception
injectScript();

// Listen for the custom solve event from the page-context
window.addEventListener('DREAMHACK_CHALLENGE_SOLVED_EVENT', (event) => {
  const { challengeId, challengeName } = event.detail;
  console.log(`[SII Extension] Solved challenge detected! ID: ${challengeId}, Name: ${challengeName}`);
  
  // Forward to background script to log into SII Portal database
  chrome.runtime.sendMessage({
    type: "DREAMHACK_SOLVE_DETECTED",
    challengeId,
    challengeName
  });
});
