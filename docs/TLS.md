# TLS via Reverse Proxy

The proxy runs on plain HTTP. To serve it over HTTPS, place it behind a reverse proxy that terminates TLS.

## Caddy (recommended — automatic HTTPS)

```bash
# Install: https://caddyserver.com/docs/install
caddy reverse-proxy --from your-domain.com --to localhost:3007
```

Or with a `Caddyfile`:

```caddyfile
your-domain.com {
    reverse_proxy localhost:3007
}
```

Caddy automatically obtains and renews Let's Encrypt certificates.

## nginx

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers (helmet already adds most, but HSTS needs TLS)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

## Self-signed certificates (development)

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=localhost"

# Then use the same nginx config above pointing to cert.pem/key.pem
```

## Notes

- Always bind the proxy to `127.0.0.1` (not `0.0.0.0`) when using a reverse proxy on the same host — set `HOST=127.0.0.1` in `.env`.
- Set `CLIENT_API_KEY` in `.env` to gate access when exposing the proxy to a network.
- The proxy sets `X-Accel-Buffering: no` on SSE streams — the nginx config above respects this with `proxy_buffering off`.
