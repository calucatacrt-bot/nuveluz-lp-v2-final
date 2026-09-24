(() => {
  const CONTENT_NAME = 'El Código de la Primera Impresión';
  const CAPI_ENDPOINT = '/api/capi';
  const TEST_EVENT_CODE = new URLSearchParams(window.location.search).get('test_event_code');

  let parameterBuilderReady = null;

  function getParameterBuilderParams() {
    if (!window.clientParamBuilder) return Promise.resolve({});
    if (!parameterBuilderReady) {
      parameterBuilderReady =
        window.clientParamBuilder.processAndCollectAllParams();
    }
    return parameterBuilderReady;
  }

  function makeEventId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return prefix + '_' + window.crypto.randomUUID();
    }
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  async function sendServerEvent(eventName, eventId, customData) {
    try {
      const response = await fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({
          event_name: eventName,
          event_id: eventId,
          custom_data: customData || {},
          ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {})
        })
      });

      if (!response.ok) {
        console.warn('Nuveluz CAPI:', response.status);
      }
    } catch (error) {
      console.warn('Nuveluz CAPI request failed:', error);
    }
  }

  async function trackEvent(eventName, customData, prefix) {
    const eventId = makeEventId(prefix);

    // Collect once per page flow so fbc/fbp are captured and persisted by Meta's
    // official Parameter Builder before the server request is made.
    await getParameterBuilderParams();

    if (window.fbq) {
      fbq('track', eventName, customData || {}, { eventID: eventId });
    }

    // The same event_id is sent server-side for Meta deduplication.
    await sendServerEvent(eventName, eventId, customData);
  }

  // ViewContent represents an actual visit to the product content.
  trackEvent('ViewContent', {
    content_name: CONTENT_NAME,
    content_type: 'product'
  }, 'vc').catch(() => {});

  document.querySelectorAll('[data-cta]').forEach((el) => {
    el.addEventListener('click', () => {
      const placement = el.dataset.cta || 'unknown';

      // This is the real checkout-intent event. It is fired once for the
      // click that takes the visitor to the Hotmart checkout.
      trackEvent('InitiateCheckout', {
        content_name: CONTENT_NAME,
        content_type: 'product',
        placement
      }, 'ic').catch(() => {});
    });
  });
})();
