const GA_MEASUREMENT_ID = 'G-1SDFY0DH0V';
const GA_API_SECRET = '6DU9XInsTL2QzIVXByDzdw';

const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

const getClientId = () => {
  let cid = localStorage.getItem('ga_client_id');
  if (!cid) {
    cid = crypto.randomUUID();
    localStorage.setItem('ga_client_id', cid);
  }
  return cid;
};

const isDev = import.meta.env.DEV;

export const analytics = {
  sendEvent: async (eventName: string, params: Record<string, unknown> = {}) => {
    // Disable analytics in development mode
    if (isDev) {
      return;
    }

    const payload = {
      client_id: getClientId(),
      events: [
        {
          name: eventName,
          params: {
            ...params,
            engagement_time_msec: 100,
            session_id: getClientId(),
          },
        },
      ],
    };

    try {
      await fetch(GA_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      // Silently fail - analytics should not affect user experience
    }
  },

  pageView: (pageTitle: string) => {
    analytics.sendEvent('page_view', {
      page_title: pageTitle,
      page_location: 'https://kaya.desktop',
    });
  },
};
