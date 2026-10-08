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

  // cd100b6 — ViewContent dedup por sessão.
  // Mantém VC semântico no primeiro Play da VSL, mas impede disparos
  // duplicados por re-render/reinicialização do player na mesma sessão.
  const VC_SESSION_ID_KEY = 'nuveluz_vc_id';
  const VC_SESSION_FIRED_KEY = 'nuveluz_vc_fired';

  function getOrCreateVCSessionId() {
    let id = sessionStorage.getItem(VC_SESSION_ID_KEY);
    if (!id) {
      id = 'vc_' + (
        window.crypto && typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : Date.now() + '_' + Math.random().toString(36).slice(2)
      );
      sessionStorage.setItem(VC_SESSION_ID_KEY, id);
    }
    return id;
  }

  function trackVslViewContentOnce() {
    if (sessionStorage.getItem(VC_SESSION_FIRED_KEY) === '1') return;

    const eventId = getOrCreateVCSessionId();
    sessionStorage.setItem(VC_SESSION_FIRED_KEY, '1');

    const eventData = {
      content_name: CONTENT_NAME,
      content_type: 'product',
      content_source: 'vsl_play'
    };

    if (window.fbq) {
      fbq('track', 'ViewContent', eventData, { eventID: eventId });
    }

    sendServerEvent('ViewContent', eventId, eventData).catch(() => {});
    console.log('[CAPI] ViewContent dedup', eventId);
  }

  // Wistia Player API: reveal the CTA only during the final 12 seconds,
  // keep it visible after the video ends, and track ViewContent on actual play.
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

  function initATCNuveluz() {
    const ctasReais = document.querySelectorAll(
      '[data-cta="vsl-final"], [data-cta="offer-price"]'
    );

    ctasReais.forEach((el) => {
      if (el.dataset.atcInit === 'true') return;
      el.dataset.atcInit = 'true';

      el.addEventListener('click', () => {
        const placement = el.dataset.cta || 'unknown';
        const eventData = {
          content_name: CONTENT_NAME,
          content_type: 'product',
          placement
        };

        trackEvent('AddToCart', eventData, 'atc').catch(() => {});
      });
    });
  }

  initATCNuveluz();
})();
