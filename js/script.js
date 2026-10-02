(() => {
  const CONTENT_NAME = 'El Código de la Primera Impresión';
  const CAPI_ENDPOINT = '/api/capi';
  const TEST_EVENT_CODE = new URLSearchParams(window.location.search).get('test_event_code');

  let parameterBuilderReady = null;

  function getParameterBuilderParams() {
    if (!window.clientParamBuilder) return Promise.resolve({});
    if (!parameterBuilderReady) {
      parameterBuilderReady = window.clientParamBuilder.processAndCollectAllParams();
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
    await getParameterBuilderParams();

    if (window.fbq) {
      fbq('track', eventName, customData || {}, { eventID: eventId });
    }

    await sendServerEvent(eventName, eventId, customData);
  }

  function revealVslCta() {
    const cta = document.getElementById('vsl-cta');
    if (cta) cta.classList.add('is-visible');
  }


  let vslViewContentSent = false;

  function trackVslViewContentOnce() {
    if (vslViewContentSent) return;
    vslViewContentSent = true;

    trackEvent('ViewContent', {
      content_name: CONTENT_NAME,
      content_type: 'product',
      content_source: 'vsl_play'
    }, 'vc').catch(() => {});
  }

  // Wistia Player API: reveal the CTA only during the final 12 seconds,
  // and keep it visible after the video ends.
  window._wq = window._wq || [];
  window._wq.push({
    id: 'jm4ut5o1o7',
    onReady: function(video) {
      // Keep the Wistia player volume at 100% while the volume control remains hidden.
      video.volume(1);
      video.bind('play', trackVslViewContentOnce);

      const revealWindow = 12;

      video.bind('secondchange', function(second) {
        const duration = video.duration();
        if (duration > 0 && second >= Math.floor(duration) - revealWindow) {
          revealVslCta();
          return video.unbind;
        }
      });

      video.bind('end', function() {
        revealVslCta();
      });
    }
  });
  let vslViewContentSent = false;

  function trackVslViewContentOnce() {
    if (vslViewContentSent) return;
    vslViewContentSent = true;

    trackEvent('ViewContent', {
      content_name: CONTENT_NAME,
      content_type: 'product',
      content_source: 'vsl_play'
    }, 'vc').catch(() => {});
  }

  // Wistia Player API: track ViewContent only when the VSL actually starts.
  // This remains in the same onReady callback as the CTA timing/volume logic.

  document.querySelectorAll('[data-cta]').forEach((el) => {
    el.addEventListener('click', () => {
      const placement = el.dataset.cta || 'unknown';
      const eventData = {
        content_name: CONTENT_NAME,
        content_type: 'product',
        placement
      };

      trackEvent('Lead', eventData, 'lead').catch(() => {});
      trackEvent('InitiateCheckout', eventData, 'ic').catch(() => {});
    });
  });
})();
