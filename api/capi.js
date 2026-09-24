const bizSdk = require('facebook-nodejs-business-sdk');

const ServerEvent = bizSdk.ServerEvent;
const EventRequest = bizSdk.EventRequest;
const UserData = bizSdk.UserData;
const CustomData = bizSdk.CustomData;

const ALLOWED_EVENTS = new Set(['ViewContent', 'InitiateCheckout']);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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

    const userData = new UserData();
    const customData = new CustomData();

    const custom = body.custom_data && typeof body.custom_data === 'object'
      ? body.custom_data
      : {};

    if (typeof custom.content_name === 'string') {
      customData.setContentName(custom.content_name);
    }

    if (typeof custom.content_type === 'string') {
      customData.setContentType(custom.content_type);
    }

    const serverEvent = new ServerEvent()
      .setEventName(eventName)
      .setEventId(eventId)
      .setEventTime(Math.floor(Date.now() / 1000))
      .setActionSource('website')
      .setUserData(userData)
      .setRequestContext(req);

    if (eventName === 'ViewContent' || eventName === 'InitiateCheckout') {
      serverEvent.setCustomData(customData);
    }

    const eventRequest = new EventRequest(accessToken, pixelId)
      .setEvents([serverEvent]);

    const response = await eventRequest.execute();

    return json(res, 200, {
      ok: true,
      event_name: eventName,
      event_id: eventId,
      response
    });
  } catch (error) {
    console.error('Nuveluz CAPI error:', error);
    return json(res, 500, { ok: false, error: 'CAPI request failed' });
  }
};
