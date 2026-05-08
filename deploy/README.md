# Production Deployment

This folder contains ready-to-use production templates for `ssh.norenvpn.com`.

## Files

- `env/backend.production.env`
- `env/frontend.production.env`
- `systemd/gui-ssh-manager.service`
- `nginx/ssh.norenvpn.com.conf`

## Suggested Layout

```text
/opt/gui-ssh-manager/
  backend/
  frontend/
```

## PostgreSQL

```bash
sudo -u postgres psql
CREATE USER ssh_panel WITH PASSWORD 'replace_me';
CREATE DATABASE ssh_panel OWNER ssh_panel;
\q
```

## Backend

```bash
cd /opt/gui-ssh-manager/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp /opt/gui-ssh-manager/deploy/env/backend.production.env .env
```

## Frontend

```bash
cd /opt/gui-ssh-manager/frontend
npm install
cp /opt/gui-ssh-manager/deploy/env/frontend.production.env .env
npm run build
```

## systemd

```bash
sudo cp /opt/gui-ssh-manager/deploy/systemd/gui-ssh-manager.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gui-ssh-manager
```

## nginx

```bash
sudo cp /opt/gui-ssh-manager/deploy/nginx/ssh.norenvpn.com.conf /etc/nginx/sites-available/gui-ssh-manager
sudo ln -s /etc/nginx/sites-available/gui-ssh-manager /etc/nginx/sites-enabled/gui-ssh-manager
sudo nginx -t
sudo systemctl reload nginx
```

## SSL

```bash
sudo certbot --nginx -d ssh.norenvpn.com
```
