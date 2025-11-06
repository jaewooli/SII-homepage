chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "SET_COOKIE") await setCookie(msg.cookie);
  else if(msg.type ==="URL_REDIRECT") chrome.tabs.create({ url: msg.url });
});

chrome.webRequest.onHeadersReceived.addListener(
  async (details) => {
    const setCookies = details.responseHeaders?.filter(h => h.name.toLowerCase() === 'set-cookie') || [];
    for (const h of setCookies) {
      const cookieObj = toChromeCookie(h.value, BASE + "/");
      await chrome.cookies.set(cookieObj);
    }
  },
  { urls: [BASE + "/*"], types: ["xmlhttprequest", "main_frame"] },
  ["responseHeaders"]
);


async function setCookie(raw) {
  const realcookie = parseCookieString(raw, 'https://dreamhack.io/');
  await chrome.cookies.set(realcookie);
}

function parseCookieString(raw, baseUrl) {
  const parts = raw.split(';').map(p => p.trim());
  const [name, value] = parts[0].split('=');

  const cookie = {
    url: baseUrl, 
    name: name,
    value: value,
    path: "/",
  };

  for (const p of parts.slice(1)) {
    if (/^domain=/i.test(p)) cookie.domain = p.split('=')[1];
    else if (/^path=/i.test(p)) cookie.path = p.split('=')[1];
    else if (/^expires=/i.test(p))
      cookie.expirationDate = Math.floor(new Date(p.split('=')[1]).getTime() / 1000);
    else if (/secure/i.test(p)) cookie.secure = true;
    else if (/httponly/i.test(p)) cookie.httpOnly = true;
    else if (/samesite/i.test(p)) {
      const val = p.split('=')[1]?.toLowerCase();
      if (val === 'none') cookie.sameSite = 'no_restriction';
      else if (val === 'lax') cookie.sameSite = 'lax';
      else if (val === 'strict') cookie.sameSite = 'strict';
    }
  }

  return cookie;
}

function toChromeCookie(setCookieStr, baseUrl) {
  const parts = setCookieStr.split(';').map(s => s.trim());
  const [nv, ...attrs] = parts;
  const [name, ...vparts] = nv.split('=');
  const value = vparts.join('=');

  const c = { url: baseUrl, name, value, path: "/" };

  for (const a of attrs) {
    const [k, ...v] = a.split('=');
    const key = k.toLowerCase();
    const val = v.join('=');

    if (key === 'domain') c.domain = val;
    else if (key === 'path') c.path = val;
    else if (key === 'secure') c.secure = true;
    else if (key === 'httponly') c.httpOnly = true;
    else if (key === 'expires') c.expirationDate = Math.floor(new Date(val).getTime()/1000);
    else if (key === 'samesite') {
      const s = val?.toLowerCase();
      c.sameSite = s === 'none' ? 'no_restriction' : (s === 'lax' ? 'lax' : 'strict');
    }
  }
  return c;
}
