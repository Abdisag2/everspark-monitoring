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

---

## MQTT path (PUSR USR-G771 and other MQTT field nodes)

`mqtt-subscriber.js` lets MQTT devices feed the **same** Supabase/dashboard,
reusing the same device `secret_token`. The device publishes to topic
`everspark/<token>` with the 9-param frame as the payload.

```
USR-G771 ──MQTT──▶ Mosquitto (this VM :1883) ──▶ mqtt-subscriber.js ──▶ Supabase
```

### 1. Install the MQTT broker + the subscriber's one dependency
```bash
sudo apt-get install -y mosquitto mosquitto-clients
# allow external connections (prototype: anonymous; lock down with auth below)
echo -e "listener 1883 0.0.0.0\nallow_anonymous true" | sudo tee /etc/mosquitto/conf.d/everspark.conf
sudo systemctl restart mosquitto

cd ~/everspark-ingest && npm install mqtt     # subscriber dependency
```
Open **TCP 1883** in the EC2 Security Group (inbound, source `0.0.0.0/0`).

> Recommended auth instead of anonymous:
> ```bash
> sudo mosquitto_passwd -c /etc/mosquitto/passwd everspark
> printf "listener 1883 0.0.0.0\nallow_anonymous false\npassword_file /etc/mosquitto/passwd\n" | sudo tee /etc/mosquitto/conf.d/everspark.conf
> sudo systemctl restart mosquitto
> ```
> then set `MQTT_USERNAME`/`MQTT_PASSWORD` in the service below, and
> `AT+MQTTUSER` / `AT+MQTTPSW` on the device.

### 2. Run the subscriber as a service
`/etc/systemd/system/everspark-mqtt.service`:
```ini
[Unit]
Description=Ever Spark MQTT Ingest
After=network.target mosquitto.service

[Service]
EnvironmentFile=/home/ubuntu/everspark-ingest/ingest.env
ExecStart=/usr/bin/node /home/ubuntu/everspark-ingest/mqtt-subscriber.js
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now everspark-mqtt
journalctl -u everspark-mqtt -f       # watch incoming frames
```
(reuses the same `ingest.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)

### 3. Configure the USR-G771 (AT commands)
```
AT+WKMOD=MQTT
AT+MQTTSVR=<EC2_PUBLIC_IP>,1883
AT+MQTTCID=esnode-001
AT+MQTTPUBTP=1,0,everspark/<DEVICE_SECRET_TOKEN>,0,0,0
AT+MQTTMOD=1
AT+Z
```
(add `AT+MQTTUSER=` / `AT+MQTTPSW=` if you enabled broker auth). The Arduino
sends the `;P1..P9:` frame over RS485; the modem publishes it as the payload.

### 4. Quick test from the VM (no hardware needed)
```bash
mosquitto_pub -h localhost -t "everspark/<DEVICE_SECRET_TOKEN>" -m ";35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:"
```
The frame should appear on the dashboard within ~8 s.

