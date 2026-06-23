FROM nginx:alpine

# GA4 Measurement ID is injected here at build time so it never lives in the repo.
# Pass it with: docker build --build-arg GA_ID=G-XXXXXXXXXX .
# If omitted, the __GA_ID__ placeholder remains and the site's runtime guard skips analytics.
ARG GA_ID=""

COPY nginx-default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/fifa2026/
COPY matches.json /usr/share/nginx/html/fifa2026/
COPY img/ /usr/share/nginx/html/fifa2026/img/
# Static FIFA Annex C table (combination -> which group's third fills each R32 match), for the
# bracket "what-if" combination selector. Reference data, never changes during the tournament.
COPY updater/third-place-allocations.json /usr/share/nginx/html/fifa2026/

RUN if [ -n "$GA_ID" ]; then \
      sed -i "s/__GA_ID__/$GA_ID/g" /usr/share/nginx/html/fifa2026/index.html; \
    fi
