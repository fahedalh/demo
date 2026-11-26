client_max_body_size 10m;
gzip on;
gzip_types text/css application/javascript application/json image/svg+xml;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;

location /api/ {
  proxy_pass http://masar_api;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
location /socket.io/ {
  proxy_pass http://masar_api;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host $host;
  proxy_read_timeout 120s;
}
location /assets/ {
  expires 1y;
  add_header Cache-Control "public, immutable";
  try_files $uri =404;
}
location = /sw.js {
  add_header Cache-Control "no-cache";
  try_files $uri =404;
}
location / {
  try_files $uri /index.html;
}
