# Ever Spark — Hardware HTTP Ingest

A tiny, zero-dependency HTTP endpoint for SIM800L field nodes that can't do TLS.
It accepts plain-HTTP POSTs from the hardware and writes directly into the same
Supabase database the dashboard reads — no ngrok, no relay.

```
SIM800L ──HTTP──▶ this server (port 8080) ──▶ Supabase ◀── Vercel dashboard
```

## Deploy on a free Oracle Cloud "Always Free" VM

1. **Create the VM:** Oracle Cloud → Compute → Instances → Create. Pick an
   **Always Free** shape (VM.Standard.E2.1.Micro or Ampere A1), Ubuntu 22.04.
   Note the **public IPv4**.
2. **Open the port (two places — both required):**
   - Oracle **VCN → Security List → Ingress Rule:** Source `0.0.0.0/0`, TCP, dest port **8080**.
   - On the VM: `sudo iptables -I INPUT 6 -p tcp --dport 8080 -j ACCEPT && sudo netfilter-persistent save`
3. **Install Node 20:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. **Copy `server.js`** to the VM (e.g. `~/everspark-ingest/server.js`).
5. **Run it as a service** so it survives reboots — create `/etc/systemd/system/everspark-ingest.service`:
   ```ini
   [Unit]
   Description=Ever Spark Ingest
   After=network.target

   [Service]
   Environment=SUPABASE_URL=https://YOUR-REF.supabase.co
   Environment=SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   Environment=PORT=8080
   ExecStart=/usr/bin/node /home/ubuntu/everspark-ingest/server.js
   Restart=always
   User=ubuntu

   [Install]
   WantedBy=multi-user.target
   ```
   Then: `sudo systemctl enable --now everspark-ingest`
6. **Test from anywhere:** `curl http://<PUBLIC_IP>:8080/` → `{"service":"Ever Spark HTTP ingest","status":"healthy"}`

A $4–6/mo VPS (Hetzner, DigitalOcean) is simpler if you'd rather skip Oracle's
security-list quirks — same steps minus the iptables line (`sudo ufw allow 8080`).

## Point the Arduino at it

```cpp
const char server[]   = "129.xxx.xxx.xxx";  // your VM public IP (no http://)
const char resource[] = "/";                // any path works
const int  port       = 8080;
```
Use the **plain** `TinyGsmClient` (not Secure), port 8080, and keep the
9-parameter `token=...&data=;P1..P9:` body. No ngrok headers needed.
