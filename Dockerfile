FROM nginx:alpine

COPY nginx-default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/fifa2026/
COPY matches.json /usr/share/nginx/html/fifa2026/
COPY img/ /usr/share/nginx/html/fifa2026/img/
