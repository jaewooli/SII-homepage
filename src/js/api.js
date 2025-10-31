export async function apiRequest(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  // JSON 파싱 실패 대비
  let payload = null;
  try { payload = res.json(); } catch (_) { payload = null; }

  // 항상 앱 레벨 형태로 반환
  return {
    httpStatus: res.status,
    ok: payload?.ok ?? res.ok,
    code: payload?.code ?? (res.ok ? 'OK' : 'ERROR'),
    message: payload?.message ?? (res.ok ? 'Success' : 'Failure'),
    action: payload?.action,
    resource: payload?.resource,
    data: payload?.data ?? null,
    raw: payload
  };
}