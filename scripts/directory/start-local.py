#!/usr/bin/env python3
"""Launch only against the existing local Supabase sandbox; never load remote credentials."""
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit
root=Path(__file__).resolve().parents[2]
env=dict(os.environ)
for line in (root/'.env.directory-local').read_text().splitlines():
 if '=' in line:
  k,v=line.split('=',1);env[k]=v
assert urlsplit(env['DATABASE_URL']).hostname=='127.0.0.1'
assert urlsplit(env['NEXT_PUBLIC_SUPABASE_URL']).hostname=='127.0.0.1'
build = '--build' in sys.argv
env['NODE_ENV']='production' if build else 'development'
if build:
 env['VERCEL_ENV']='preview'
 env['SENTRY_AUTH_TOKEN']=''
 for feature in ('ADMIN','CATALOG','CLAIMS','IMPORTS','COMMUNICATIONS'):
  env[f'DIRECTORY_{feature}_ENABLED']='false'
env['NEXT_TELEMETRY_DISABLED']='1'
# Local validation never uses the repository's remote payment credentials.
for name in ('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_MARKETPLACE_WEBHOOK_SECRET'):
 env[name]=''
os.chdir(root)
os.execve(str(root/'node_modules/.bin/next'),(['next','build'] if build else ['next','dev','--hostname','localhost','--port','3109']),env)
