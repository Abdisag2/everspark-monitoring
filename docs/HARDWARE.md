# Hardware Pipeline — Ingest, Brokers & Devices

How real field hardware gets its telemetry onto the dashboard. Because cheap
cellular modules can't talk to HTTPS-only Vercel, a small always-on VM runs the
ingest endpoints and writes straight to Supabase.

```
SIM800L  ──HTTP :8080──┐
                       ├──▶  EC2 VM  ──(service-role)──▶ Supabase ──▶ dashboard
USR-G771 ──MQTT :1883──┘     (Ubuntu)
```

Files live in [`hardware-ingest/`](../hardware-ingest/) and run **on the VM**, not
in the Next.js build.

---

## 1. Provision the ingest VM (AWS EC2 free tier)

1. **EC2 → Launch instance** → **Ubuntu 22.04**, type **t2.micro / t3.micro**
   (free-tier), enable **auto-assign public IP**, create/download a key pair.
2. **Security Group → inbound rules** (add as needed):
   | Port | Purpose |
   |------|---------|
   | 22 | SSH |
   | 8080 | HTTP ingest (SIM800L) |
   | 1883 | MQTT (USR-G771) |
   Source `0.0.0.0/0` for the ingest ports.
3. SSH in: `ssh -i key.pem ubuntu@<PUBLIC_IP>`
4. Install Node 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

> Free public IPv4 is included for 12 months on AWS free tier; after that it
> bills (~$3.6/mo). [Oracle Cloud "Always Free"](https://www.oracle.com/cloud/free/)
> runs the same files permanently free.

### Shared environment file
Both services read the same `ingest.env`:
```bash
mkdir -p ~/everspark-ingest && cat > ~/everspark-ingest/ingest.env <<'EOF'
SUPABASE_URL=https://YOUR-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
PORT=8080
EOF
chmod 600 ~/everspark-ingest/ingest.env
```
Copy `server.js` and `mqtt-subscriber.js` from `hardware-ingest/` into
`~/everspark-ingest/` (paste over SSH, or `scp`).

---

## 2. Register a device (and get its token)

Every device authenticates with a unique `secret_token`. Create one either way:

**Dashboard:** sign in as admin → **Devices → Register** → click the token chip
to copy the generated `es_...` token.

**SQL** (to use a fixed token):
```sql
with org as (insert into public.organizations (name) values ('Field Test') returning id)
insert into public.devices (organization_id, name, secret_token, status, location, system_id)
select id, 'Clara Field Node', 'es_your_token_here', 'offline', 'Site A', 'node-01' from org;
```
That token is what you flash/configure into the device.

---

## 3. HTTP path — Arduino + SIM800L (2G)

The SIM800L speaks **plain HTTP only** (no TLS). It posts directly to the VM.

### 3a. Run the HTTP ingest service
```bash
sudo tee /etc/systemd/system/everspark-ingest.service > /dev/null <<'EOF'
[Unit]
Description=Ever Spark HTTP Ingest
After=network.target
[Service]
EnvironmentFile=/home/ubuntu/everspark-ingest/ingest.env
ExecStart=/usr/bin/node /home/ubuntu/everspark-ingest/server.js
Restart=always
User=ubuntu
[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now everspark-ingest
curl http://localhost:8080/        # {"service":"Ever Spark HTTP ingest","status":"healthy"}
```

### 3b. Arduino sketch (essentials)
```cpp
#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#define SerialAT Serial1
TinyGsmClient client(modem);                 // plain (NOT secure)
const char server[]   = "<EC2_PUBLIC_IP>";   // raw IP, no http://
const char resource[] = "/";
const int  port       = 8080;
const char deviceToken[] = "es_your_token_here";
// loop(): POST  token=<deviceToken>&data=<9-param frame>
//   client.print("POST / HTTP/1.1\r\nHost: <IP>\r\n...Content-Type: application/x-www-form-urlencoded\r\n\r\n");
//   client.print("token=" + String(deviceToken) + "&data=;35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:");
```
Build the frame from real sensor reads; keep the `;P1..P9:` format. (Full sketch
in project history; power the SIM800L well — add a 1000 µF cap across VCC/GND to
avoid brownout during the transmit spike.)

### Why not HTTPS directly?
The SIM800L can't complete a TLS 1.2 + SNI handshake, so it can't reach Vercel.
Pointing it at the VM's plain-HTTP `:8080` is the reliable path. (ngrok works too
but requires `--scheme http` and a host in the loop.)

---

## 4. MQTT path — Arduino + USR-G771 (4G)

The USR-G771 is a 4G modem with a native MQTT engine. Arduino → RS485 → modem →
publishes to your broker. Topic carries the token, payload carries the frame.

```
USR-G771 publishes:  topic  everspark/<token>   payload  ;P1..P9:
```

### 4a. Install Mosquitto + the subscriber
```bash
sudo apt-get install -y mosquitto mosquitto-clients
# external listener + auth (recommended)
sudo mosquitto_passwd -c /etc/mosquitto/passwd everspark
printf "listener 1883 0.0.0.0\nallow_anonymous false\npassword_file /etc/mosquitto/passwd\n" \
  | sudo tee /etc/mosquitto/conf.d/everspark.conf
sudo chown mosquitto:mosquitto /etc/mosquitto/passwd && sudo chmod 640 /etc/mosquitto/passwd
sudo systemctl restart mosquitto

cd ~/everspark-ingest && npm install mqtt
printf "MQTT_USERNAME=everspark\nMQTT_PASSWORD=YOUR_BROKER_PASSWORD\n" >> ingest.env
```
> For a quick first test you can use `allow_anonymous true` and skip the
> password/`MQTT_*` lines — but never leave an open broker on a public IP.

### 4b. Run the MQTT subscriber service
```bash
sudo tee /etc/systemd/system/everspark-mqtt.service > /dev/null <<'EOF'
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
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now everspark-mqtt
journalctl -u everspark-mqtt -n 5 --no-pager    # MQTT connected + subscribed: everspark/+
```

### 4c. Configure the USR-G771 (PC tool or AT commands)
| Setting | Value |
|---------|-------|
| Work mode | MQTT |
| Server / Port | `<EC2_PUBLIC_IP>` / `1883` |
| Client ID | any unique, e.g. `esnode-001` |
| Username / Password | `everspark` / `YOUR_BROKER_PASSWORD` |
| **Publish topic** | `everspark/<DEVICE_SECRET_TOKEN>` |
| Publish QoS / Retain | `0` / off |

AT-command equivalent:
```
AT+WKMOD=MQTT
AT+MQTTSVR=<EC2_PUBLIC_IP>,1883
AT+MQTTCID=esnode-001
AT+MQTTUSER=everspark
AT+MQTTPSW=YOUR_BROKER_PASSWORD
AT+MQTTPUBTP=1,0,everspark/<DEVICE_SECRET_TOKEN>,0,0,0
AT+MQTTMOD=1          ; disables auto-subscribe (prevents "SUBSCRIBE rejected")
AT+Z                  ; save & reboot
```
The Arduino sends the `;P1..P9:` frame over RS485 (MAX485, 115200 baud, **shared
ground required**); it becomes the MQTT payload.

---

## 5. Verify the whole pipeline

**HTTP:**
```bash
curl -X POST http://<EC2_IP>:8080/ --data "token=<TOKEN>&data=;35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:"
# → {"status":"ok","device":"<name>", ...}
```
**MQTT** (subscriber must be running):
```bash
mosquitto_pub -h localhost -u everspark -P 'YOUR_BROKER_PASSWORD' \
  -t "everspark/<TOKEN>" -m ";35.0,12.3,1,0,0,0.7,1.0,0.8,7.0:"
journalctl -u everspark-mqtt -n 3 --no-pager      # [ts] <device> <- ;...:
```
Either way the device goes **Online** and the frame appears in the dashboard's
telemetry stream / charts within ~8 s (the dashboard polls Supabase).

### Triggering alarms (for testing)
```bash
# NaClO depleted (level 3 = 1)
curl -X POST http://<EC2_IP>:8080/ --data "token=<TOKEN>&data=;0,12,0,0,1,0,1.0,0.1,7.3:"
```

---

## 6. Troubleshooting cheatsheet

| Symptom | Cause / fix |
|---------|-------------|
| `connection failed` (HTTP) / can't reach `:8080`/`:1883` | Security Group rule missing, or service not running |
| `307 Temporary Redirect` to https | Pointed at Vercel/HTTPS — point at the VM's plain HTTP, or ngrok `--scheme http` |
| `TLS connection FAILED` (SIM800L direct) | Module can't do modern TLS — use the HTTP VM path |
| `MODULE_NOT_FOUND` (systemd) | The `.js` file isn't at the path, or `npm install mqtt` not run |
| service exits in ms / `Set SUPABASE_URL...` | `ingest.env` not linked or values missing |
| MQTT `Connection refused: Not authorized` | Broker auth on, but subscriber/device creds wrong/missing |
| MQTT publish lands nowhere | QoS 0 drops messages if no subscriber is connected at publish time — start the subscriber first |
| `Unknown token` | The `secret_token` isn't registered in `devices`, or a stray space in the topic |
| Device brownouts / resets mid-send (SIM800L) | Weak power — charged battery, thick wires, 1000 µF cap on VCC/GND |
