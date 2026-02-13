# Production deploy

One process serves the game: HTTP + static client + WebSockets on a single port (default 3000).

## Quick start (local or VM)

From the repo root:

```bash
npm ci
npm run build
npm start
```

Then open **http://localhost:3000**. The server serves the built client and handles `/ws` for the game.

## Env (production)

| Variable     | Default   | Purpose |
|------------|-----------|--------|
| `PORT`     | `3000`    | Listen port. Set on the host (e.g. `PORT=8080 npm start`) or in your process manager. |
| `PUBLIC_DIR` | *(unset)* | Path to built client static files. The root `npm start` script sets this to `./client/dist`; override if you deploy files elsewhere. |

## Deploy on a VM (e.g. Digital Ocean)

1. **Create a droplet** (e.g. Ubuntu 22, 1 vCPU / 2 GB RAM for small traffic).

2. **Install Node 20** (LTS):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Deploy the app** (clone or rsync from your machine):
   ```bash
   cd /opt
   sudo git clone https://github.com/your-org/spong.git
   cd spong
   sudo chown -R $USER:$USER .
   npm ci
   npm run build
   ```

4. **Run with a process manager** (keeps it up and restarts on crash). Example with **pm2**:
   ```bash
   sudo npm install -g pm2
   PORT=3000 PUBLIC_DIR=/opt/spong/client/dist pm2 start server/dist/index.js --name spong --cwd /opt/spong
   pm2 save
   pm2 startup   # follow the command it prints to enable on boot
   ```

   Or with **systemd**: create `/etc/systemd/system/spong.service`:
   ```ini
   [Unit]
   Description=Spong game server
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/spong
   Environment=NODE_ENV=production
   Environment=PORT=3000
   Environment=PUBLIC_DIR=/opt/spong/client/dist
   ExecStart=/usr/bin/node server/dist/index.js
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```
   Then: `sudo systemctl daemon-reload`, `sudo systemctl enable spong`, `sudo systemctl start spong`.

5. **Firewall**: open the port you use (e.g. `sudo ufw allow 3000`, `sudo ufw enable`).

6. **(Optional) HTTPS**: put Nginx or Caddy in front, proxy to `http://127.0.0.1:3000`, and terminate TLS. Then clients use `https://your-domain` and `wss://your-domain/ws` with no port in the URL.

## Docker (optional)

See **docs/DOCKER_SINGLE_PLAN.md** for the single-container setup. Build and run:

```bash
docker compose up --build
```

Or build the image and run it elsewhere:

```bash
docker build -t spong .
docker run -p 3000:3000 spong
```

Note: The Docker image had been tuned for a VM-style run; if you hit module resolution errors in the container, prefer the VM flow above until the image is updated.

## Checklist before going live

- [ ] `npm run build` and `npm start` work locally.
- [ ] `PORT` and (if needed) `PUBLIC_DIR` are set on the host or in your process manager.
- [ ] Firewall allows the chosen port.
- [ ] If you use a reverse proxy, WebSocket upgrade for `/ws` is proxied (Nginx: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
