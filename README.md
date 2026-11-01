# LG Sota WebOS

Personal, unofficial webOS client for an existing Sota VPN subscription. This project is not affiliated with Sota or LG. Tested on LG 43UN68006LA, webOS 5.6, ARMv7, Node 8.12.0, with an already rooted Homebrew Channel installation.

## Features

- Large Russian interface and locally cached country flags.
- Countries ordered by measured TCP latency from the TV; Russia and bridges stay at the bottom. Automatic selection is pinned first.
- Measurements use a loopback-only SOCKS listener routed DIRECT, avoiding an extra hop through the currently selected VPN. Two gateways per country, two samples each, bounded concurrency. This measures TCP response time on port 443, not ICMP or download speed.
- Fresh provider settings, up to three distinct connection candidates, rollback to the previous connection after failure.
- Boot and wake recovery with respect for manual disconnection. The Homebrew startup hook launches a single background supervisor. No foreground VPN screen is required.
- Daily update checks, RSA-SHA256 signed compatible webOS releases, size/hash verification, manual installation or staging for the next full boot, and rollback. Official Sota releases are checked separately; Android/Windows packages are never installed as webOS updates.

## Personal data

The source and release IPK contain no access key, subscription profile, pairing key, device identifier, private signing key, or home-network addresses. Account data is provisioned separately on the TV in `/media/developer/sota-lg/account.json`, mode 0600 inside a 0700 directory. Do not commit or share that directory. The signing key stays with the maintainer; the app contains only its public verification key.

## Building

Requirements: Python 3, Node/npm, the LG webOS packaging CLI.

```sh
python prepare_core.py
python build.py
node tests/service.test.js
```

The core downloader verifies the exact unmodified upstream ARMv7 binary. The package is created by LG's official CLI. Release signing requires a separately stored maintainer key:

```sh
node tools/sign-release.js /path/to/private-key.pem dist/com.local.sota.tv_VERSION_all.ipk https://github.com/OWNER/REPO/releases/download/vVERSION/com.local.sota.tv_VERSION_all.ipk latest.json
```

## Runtime and installation

This project requires a TV that is already rooted and has Homebrew Channel. It does not change system partitions or provide a rooting method. Install the release IPK using a trusted local developer installer. Provision your own account and initial profile locally, then install `boot-hook.sh` as `/var/lib/webosbrew/init.d/80-sota-vpn` (0755). Keep previous working app/configuration backups. Existing users receive signed compatible releases through the app.

A full power-off stops all TV processes; the VPN starts again once the TV and network are ready. Standby may keep the process alive. Manual disconnection pauses recovery for the current boot. Automatic app updates are installed at the next full boot; TV firmware updates are not managed by this app.

## Components and licenses

Application code: MIT. Sota logo/branding belong to Sota and identify service compatibility. The unmodified sing-box 1.13.21 engine is GPLv3; its license and upstream source links are in `app/com.local.sota.tv/licenses`. Each release also provides the matching upstream source archive. National-flag artwork is cached from the public Sota CDN for country identification; the original URLs are recorded in `flags/SOURCES.json`. National symbols retain any applicable usage restrictions. This unofficial client is not endorsed by Sota.
