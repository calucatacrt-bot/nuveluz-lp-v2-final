const ALLOWED_EVENTS = new Set(['ViewContent', 'AddToCart']);
const META_GRAPH_VERSION = 'v26.0';

const PRODUCTION_HOSTS = new Set(['www.nuveluz.com', 'nuveluz.com']);
const PREVIEW_HOSTS = new Set([
  'nuveluz-lp-v2-final-git-main-carlos-roberto-tavares-projects.vercel.app',
  'nuveluz-lp-v2-final-carlos-roberto-tavares-projects.vercel.app',
  'nuveluz-lp-v2-final-git-main-calucatacrt-bot.vercel.app',
  'nuveluz-lp-v2-final-calucatacrt-bot.vercel.app',
  'localhost',
  '127.0.0.1'
]);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseHttpUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      return null;
    }
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function cleanEventSourceUrl(url) {
  const clean = new URL(url.toString());
  for (const key of [...clean.searchParams.keys()]) {
    if (!/^utm_[a-z0-9_]+$/i.test(key) && !['fbclid', 'gclid'].includes(key.toLowerCase())) {
      clean.searchParams.delete(key);
    }
  }
  clean.hash = '';
  return clean.toString();
}

function getAllowedTestCode(req, body) {
  const supplied = req.query?.test_event_code || body?.test_event_code;
  if (typeof supplied !== 'string' || !supplied.trim()) return null;

  const configured = String(process.env.META_TEST_EVENT_CODES || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  if (!configured.length || !configured.includes(supplied.trim())) return null;
  return supplied.trim();
}

function getValidatedSource(req, body) {
  const refererValue = req.headers?.referer || req.headers?.referrer;
  const originValue = req.headers?.origin;
  const referer = parseHttpUrl(refererValue);
  const origin = parseHttpUrl(originValue);
  const testCode = getAllowedTestCode(req, body);

  if (!referer) return { error: 'Referer ausente ou inválido' };
  if (originValue && !origin) return { error: 'Origin inválido' };
  if (origin && origin.hostname !== referer.hostname) {
    return { error: 'Origin e Referer não correspondem' };
  }

  const host = referer.hostname.toLowerCase();
  const isProduction = PRODUCTION_HOSTS.has(host);
  const isPreview = PREVIEW_HOSTS.has(host);
  const suppliedTestCode = Boolean(body?.test_event_code || req.query?.test_event_code);

  if (isProduction && suppliedTestCode) {
    return { error: 'Eventos de teste não são aceitos no domínio de produção' };
  }
  if (!isProduction && !(isPreview && testCode)) {
    return { error: 'Origem não autorizada para envio de eventos' };
  }

  return {
    eventSourceUrl: cleanEventSourceUrl(referer),
    testCode: isProduction ? null : testCode
  };
}

function getClientIp(req) {
  const ip = req.headers?.['x-real-ip'];
  return typeof ip === 'string' && ip.trim() ? ip.trim() : undefined;
}

function getCookie(req, name) {
  const header = req.headers?.cookie || '';
  for (const part of header.split(';')) {
    const item = part.trim();
    if (item.startsWith(name + '=')) {
      try {
        return decodeURIComponent(item.slice(name.length + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID;
  if (!accessToken || !pixelId) {
    return json(res, 500, { ok: false, error: 'Meta CAPI environment variables are missing' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const eventName = body.event_name;
    const eventId = body.event_id;

    if (!ALLOWED_EVENTS.has(eventName)) {
      return json(res, 400, { ok: false, error: 'Unsupported event' });
    }
    if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(eventId)) {
      return json(res, 400, { ok: false, error: 'Invalid event_id' });
    }

    const source = getValidatedSource(req, body);
    if (source.error) return json(res, 403, { ok: false, error: source.error });

    const userData = {};
    const fbp = getCookie(req, '_fbp');
    const fbc = getCookie(req, '_fbc');
    const clientIp = getClientIp(req);
    const userAgent = req.headers?.['user-agent'];

    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (clientIp) userData.client_ip_address = clientIp;
    if (typeof userAgent === 'string' && userAgent) userData.client_user_agent = userAgent;

    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: source.eventSourceUrl,
      user_data: userData
    };

    const custom = body.custom_data && typeof body.custom_data === 'object' ? body.custom_data : {};
    const customData = {};
    if (typeof custom.content_name === 'string') customData.content_name = custom.content_name.slice(0, 200);
    if (typeof custom.content_type === 'string') customData.content_type = custom.content_type.slice(0, 100);
    if (typeof custom.content_source === 'string') customData.content_source = custom.content_source.slice(0, 100);
    if (typeof custom.placement === 'string') customData.placement = custom.placement.slice(0, 100);
    if (Object.keys(customData).length) event.custom_data = customData;

    const metaPayload = { data: [event] };
    if (source.testCode) metaPayload.test_event_code = source.testCode;

    const graphUrl = 'https://graph.facebook.com/' + META_GRAPH_VERSION + '/' +
      encodeURIComponent(pixelId) + '/events';

    const metaResponse = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken
      },
      body: JSON.stringify(metaPayload)
    });

    const metaBody = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok || (typeof metaBody.events_received === 'number' && metaBody.events_received < 1)) {
      console.error('Nuveluz Meta CAPI error:', metaResponse.status, metaBody);
      return json(res, 502, { ok: false, error: 'Meta CAPI rejected the event', meta_status: metaResponse.status });
    }

    return json(res, 200, {
      ok: true,
      event_name: eventName,
      event_id: eventId,
      events_received: metaBody.events_received
    });
  } catch (error) {
    console.error('Nuveluz CAPI error:', error);
    return json(res, 500, { ok: false, error: 'CAPI request failed' });
  }
};
