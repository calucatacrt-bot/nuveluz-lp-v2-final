const ALLOWED_EVENTS = new Set(['ViewContent', 'InitiateCheckout']);
const META_GRAPH_VERSION = 'v26.0';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getCookie(req, name) {
  const header = req.headers?.cookie || '';
  const parts = header.split(';');
  for (const part of parts) {
    const item = part.trim();
    if (item.startsWith(name + '=')) {
      return decodeURIComponent(item.slice(name.length + 1));
    }
  }
  return undefined;
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || undefined;
}

function getEventSourceUrl(req) {
  const referer = req.headers?.referer || req.headers?.referrer;
  return typeof referer === 'string' && referer.length ? referer : undefined;
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
    const body = req.body || {};
    const eventName = body.event_name;
    const eventId = body.event_id;

    if (!ALLOWED_EVENTS.has(eventName)) {
      return json(res, 400, { ok: false, error: 'Unsupported event' });
    }

    if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 200) {
      return json(res, 400, { ok: false, error: 'Invalid event_id' });
    }

    const custom = body.custom_data && typeof body.custom_data === 'object'
      ? body.custom_data
      : {};

    const userData = {};
    const fbp = getCookie(req, '_fbp');
    const fbc = getCookie(req, '_fbc');
    const clientIp = getClientIp(req);
    const userAgent = req.headers?.['user-agent'];
    const eventSourceUrl = getEventSourceUrl(req);

    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;
    if (clientIp) userData.client_ip_address = clientIp;
    if (typeof userAgent === 'string' && userAgent) userData.client_user_agent = userAgent;

    const event = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      user_data: userData
    };

    if (eventSourceUrl) event.event_source_url = eventSourceUrl;

    const customData = {};
    if (typeof custom.content_name === 'string') customData.content_name = custom.content_name;
    if (typeof custom.content_type === 'string') customData.content_type = custom.content_type;
    if (Object.keys(customData).length) event.custom_data = customData;

    const graphUrl = 'https://graph.facebook.com/' + META_GRAPH_VERSION + '/' +
      encodeURIComponent(pixelId) + '/events';

    const metaResponse = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify({ data: [event] })
    });

    const metaBody = await metaResponse.json().catch(() => ({}));

    if (!metaResponse.ok) {
      console.error('Nuveluz Meta CAPI error:', metaResponse.status, metaBody);
      return json(res, 502, {
        ok: false,
        error: 'Meta CAPI rejected the event',
        meta_status: metaResponse.status
      });
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
