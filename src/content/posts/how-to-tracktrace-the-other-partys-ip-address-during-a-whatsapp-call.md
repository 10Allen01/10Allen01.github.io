---
title: "How to Track/Trace the Other Party's IP Address During a WhatsApp Call"
excerpt: "A Defensive Network Auditing & VoIP Traffic Analysis Exercise for Educational Purposes.Ever wondered what your own network traffic looks like when you pick up a WhatsApp call? Yeah, me neither, So I did what any reasonable, law-abiding network administrator would do — I opened Wireshark and audited my own traffic for suspicious connections. Purely out of concern for my personal cybersecurity posture, of course. What follows is a documentation of that process. For science. And peace of mind."
publishedAt: "2026-04-17"
section: "security"
featured: false
draft: false
tags:
  - "Network Defense"
  - "VoIP Traffic Analysis"
  - "Personal Security"
cover: "/images/posts/how-to-tracktrace-the-other-partys-ip-address-during-a-whatsapp-call/1f6c0390b49e6e015228724abc0eec0c.jpg"
coverAlt: "How to Track/Trace the Other Party's IP Address During a WhatsApp Call"
images: []
---

## ⚠️ Legal Disclaimer & Responsibility Transfer

**READ THIS BEFORE YOU SCROLL PAST IT LIKE TERMS OF SERVICE, YOU DEGENERATE.**

This publication constitutes protected educational speech under the principles of academic freedom recognized across virtually every modern legal jurisdiction. The content herein documents **network self-auditing techniques** — that is, the analysis of **traffic on networks you own, operate, or have explicit authorization to monitor.**

By accessing, reading, bookmarking, screenshotting, or even *thinking about* this page after viewing it, **you — the visitor — acknowledge and accept the following:**

1. **You, the reader, are solely and exclusively responsible** for any and all actions you take based on information contained herein. The author publishes this material in the same capacity as a university professor demonstrating packet analysis in a networking course. If you take a chemistry lesson and cook something you shouldn't, that's on *you*, not the professor.

2. **The author does not endorse, encourage, facilitate, or condone** the use of any technique described here for unauthorized surveillance, stalking, harassment, violation of any individual's privacy, or any activity that contravenes local, state, federal, or international law — including but not limited to the Computer Fraud and Abuse Act (US), Computer Misuse Act 1990 (UK), Articles 285–287 of the Criminal Law of the PRC, the IT Act 2000 (India), the Budapest Convention on Cybercrime, GDPR (EU), and any equivalent legislation in your jurisdiction.

3. **Monitoring network traffic you do not own or lack explicit authorization to analyze is illegal** in most jurisdictions. This tutorial demonstrates analysis of **your own outbound and inbound packets on your own device, on your own network.** That's not hacking — that's reading your own mail.

4. **You assume all legal liability.** The author is a blogger documenting his own home network experiments. If you do something stupid and a judge asks "where'd you learn this?" — leave my name out of your mouth. Seriously. I am not your co-defendant. I am not your mentor. I am a stranger on the internet who looked at his own packets and wrote about it.

5. **This content may be taken down, modified, or made unavailable at any time** without notice. No warranties, expressed or implied. AS-IS basis. If this tutorial somehow bricks your machine, that's between you and whatever god you pray to.

6. **Severability clause:** If any provision of this disclaimer is deemed unenforceable in your jurisdiction, all remaining provisions survive in full force. I am covered like a burrito in a tortilla of legal insulation.

**TL;DR:** This is *my* diary about *my* network. You're just reading it. Whatever you do after is *your* problem. We clear? Good. Moving on.

---

## Why Should You Care About Your Own VoIP Traffic?

Lemme paint a picture. You get a WhatsApp call from an unknown number. Maybe it's a recruiter. Maybe it's a scammer. Maybe it's your ex using a burner. The point is — **you don't know who's connecting to your device.**

When a WhatsApp voice or video call is established, your device *may* form a direct peer-to-peer (P2P) UDP connection with the other party. Emphasis on "may" because Meta has been increasingly routing calls through relay (TURN) servers. But in a significant number of cases — especially on the desktop client and in certain network configurations — the connection is still partially or fully P2P.

And P2P means their IP touches your network adapter. Which means if you're monitoring your own adapter... well, you can see it. That's not surveillance. That's looking at your own front door.

Here's the thing nobody in corporate infosec Twitter wants to say out loud: **knowing what IP addresses are connecting to your machine is baseline operational security.** It's literally what firewalls do. I'm just doing it manually because I have trust issues and too much free time.

---

## What You'll Need

Nothing sketchy. All of this is free, open-source, and used by every network engineer, sysadmin, and CompTIA student on the planet.

| Tool | What it is | Where to get it |
|------|-----------|----------------|
| **Wireshark** | The world's most popular open-source packet analyzer. Used by literally every SOC on earth. | [wireshark.org](https://wireshark.org) |
| **WhatsApp Desktop** | The official desktop client. We're using this instead of mobile because capturing packets off your own PC's NIC is trivially simple. | [whatsapp.com/download](https://whatsapp.com/download) |
| **Your own computer** | Running Windows 10/11, macOS, or Linux. Doesn't matter. | Presumably you own one if you're reading this. |
| **Your own network** | Your home Wi-Fi. Your hotspot. A network you own and operate. | Not Starbucks. *Your* network. |
| **A brain** | At least partially functional. | Results may vary. |

Optional but fun:
- **ipinfo.io** or **iplocation.net** — free IP geolocation lookups. For looking at where your connections originate. Totally public, totally legal, the data is literally in WHOIS databases.
- **termux** (Android) or a **rooted device** — if you want to do mobile-side captures, but honestly, this is Advanced Suffering™ and outside the scope of this walkthrough.

---

## Step-by-Step: Auditing Your Own VoIP Traffic

### Step 1: Install Wireshark (The Legal Surveillance Camera for Your Own Packets)

Go to [wireshark.org/download](https://www.wireshark.org/download.html). Download the version for your OS.

**Windows users:** Run the installer. When it asks about **Npcap** — install it. That's the packet capture driver. Without it, Wireshark is just a pretty window that does nothing, kinda like most management at your company.

During Npcap install, check the box that says **"Support raw 802.11 traffic"** if it appears. Doesn't hurt. Leave other settings default.

**macOS users:** Grab the `.dmg`, drag it to Applications. You might need to authorize it in System Preferences → Security & Privacy. Apple will passive-aggressively warn you about it. Ignore it. Apple warns you about everything.

**Linux users:** 

```bash
sudo apt update && sudo apt install wireshark -y
```

When it asks "Should non-superusers be able to capture packets?" — select **Yes**, then add yourself to the `wireshark` group:

```bash
sudo usermod -aG wireshark $USER
```

Log out and back in for group changes to take effect. Or reboot. I know you haven't rebooted that Debian box since 2024. Now's the time.

---

### Step 2: Identify Your Active Network Interface

Open Wireshark. You'll see a list of available network interfaces on the welcome screen. Each one will show a tiny sparkline graph of activity.

**You're looking for the one that's actually showing traffic** — that's your active NIC.

- **Wi-Fi adapter** → Usually called something like `Wi-Fi`, `wlan0`, `en0`
- **Ethernet** → `Ethernet`, `eth0`, `en1`
- **If you're hotspotting from your phone and tethering** → might show up as `RNDIS` or `usb0`

**Pro tip that isn't in most tutorials:** If you're not sure which interface is which, open a terminal and ping something:

```bash
ping -c 5 8.8.8.8
```

Then look at which interface in Wireshark just lit up with ICMP traffic. That's your guy.

Don't start capturing yet. Just know which interface you're going to use.

---

### Step 3: Close Everything That Isn't WhatsApp

This is the step 90% of people skip and then spend 45 minutes scrolling through 80,000 packets from Chrome checking for extension updates, Spotify streaming, Discord WebRTC, Windows telemetry, and god knows what else your machine is doing behind your back.

**Close. Everything.**

- Browser: closed
- Spotify: closed
- Discord: closed
- Steam: closed (yes, even in the tray — right click, exit)
- OneDrive/Dropbox/Google Drive sync: paused
- Email client: closed
- That random Electron app you forgot was running: closed
- Background updaters: can't do much about these, but minimize the noise

**Windows users** — open Task Manager (`Ctrl+Shift+Esc`), go to the "Network" column, sort by it, and kill anything chatty that you don't need.

**macOS users** — Activity Monitor → Network tab. Same drill.

**Linux users** — you already know. `nethogs` or `iftop` and start murdering processes.

The goal is to create a **quiet network environment** so when the WhatsApp call starts, the relevant traffic sticks out like a guy in a suit at a punk show.

---

### Step 4: Set Up a Wireshark Capture Filter (Pre-Capture)

Before you hit the big blue shark fin button, let's set a capture filter to reduce noise right from the start.

Double-click your active interface in Wireshark (or select it and click the gear icon). In the **"Capture filter"** box, type:

```
udp
```

That's it. WhatsApp voice/video calls use **UDP** for media transport (SRTP over UDP, specifically). We don't care about TCP right now — that's mostly the signaling/control channel talking to Meta's servers. The juicy stuff — the actual call media, and therefore the potential P2P connection — is UDP.

If you want to be slightly more surgical (and you should, because less noise = less crying later):

```
udp and not port 53 and not port 5353
```

This strips out DNS queries (`port 53`) and mDNS (`port 5353`) which are noisy as hell and completely irrelevant to what we're doing. Your machine sends DNS requests like a nervous kid raising their hand in class — constantly and about everything.

Hit **Start** (the blue fin) or press `Ctrl+E`. Wireshark is now capturing. You should see... almost nothing, if you did Step 3 right. A few stray UDP packets maybe. That's fine.

**Leave Wireshark running.**

---

### Step 5: Make the WhatsApp Call

Open WhatsApp Desktop. Call someone. Ideally someone who knows you're doing this, because:

1. It's polite
2. They need to actually *pick up*
3. If you're calling your buddy and saying "hey stay on the line for 60 seconds I'm looking at packets," that's a lot less awkward than calling your dentist

**Voice call is fine.** Video call works too and might generate more traffic (larger UDP streams), making it even easier to spot. Either works.

**Let the call connect and stay connected for at least 30-60 seconds.** You want a solid stream of UDP traffic to form, not just the initial handshake.

Talk about whatever. "Hey man, you see the game last night?" "Nah." "Cool." That's sufficient.

---

### Step 6: Stop the Capture and Analyze

After a minute or so on the call, hang up. Go back to Wireshark and hit the red square (**Stop Capture**) or `Ctrl+E` again.

Now you've got a packet capture (pcap) of your own network traffic during the call. Time to dig.

---

### Step 7: Apply Display Filters to Find the Peer Connection

Here's where it gets interesting.

First, let's see what IP addresses your machine was talking to. In the **display filter bar** (the green bar at the top — not the capture filter), type:

```
udp && !dns
```

This shows all UDP traffic minus DNS. You'll see a list of packets. Look at the **Source** and **Destination** columns.

**You'll notice a few types of IPs:**

- **Your own local IP** (e.g., `192.168.1.x`) — that's you
- **Meta/Facebook server IPs** — these are relay servers. Usually in ranges owned by Facebook/Meta (AS32934). They'll often be in the `157.240.x.x`, `31.13.x.x`, `179.60.x.x`, or `163.70.x.x` ranges.
- **One (or more) IPs that are NOT Meta servers** — 👀

That third category is what we care about.

**To quickly figure out what's what**, let's use Wireshark's built-in conversation analysis:

Go to **Statistics → Conversations → UDP tab.**

This will give you a beautiful table showing every UDP "conversation" (pair of endpoints) in your capture, sorted by bytes transferred. The one with the **most data** is almost certainly your media stream.

Look at the two IPs in that top conversation. One is yours. The other is either:

a) **A Meta relay server** (TURN server) — meaning the call was relayed, and you're seeing Meta's infrastructure IP, not the peer's actual IP.

b) **The actual IP of the person you called** — meaning the connection went P2P, and congratulations, you just identified an IP address connecting to your machine from your own packet capture. Which is, again, *reading your own mail.*

---

### Step 8: Determine If You Got a Relay or a Peer

Okay so how do you tell the difference? Couple ways.

**Method A — WHOIS / ASN lookup:**

Copy that IP. Go to [ipinfo.io](https://ipinfo.io) and paste it in.

If the result comes back with:
- **Org:** `Facebook, Inc.` or `Meta Platforms, Inc.`
- **ASN:** `AS32934`

...then you got a relay. The call was routed through Meta's TURN servers. This happens more often now than it used to, especially on mobile clients and when both parties are on restrictive NATs. You're seeing Meta's server, not the other person.

If the result comes back with:
- **Org:** Some random ISP (Comcast, Vodafone, Airtel, BT, whatever)
- **ASN:** Not Facebook's

...then that's a residential or mobile ISP IP. That traffic came from (or went to) a real endpoint that isn't Meta's infrastructure.

**Method B — STUN binding analysis:**

WhatsApp (like most WebRTC-adjacent VoIP) uses **STUN** (Session Traversal Utilities for NAT) to establish connectivity. Wireshark can decode STUN.

Display filter:

```
stun
```

If you see STUN Binding Requests/Responses in your capture, look at the **XOR-MAPPED-ADDRESS** attribute in the STUN responses. This contains the reflexive transport address — basically, the public IP and port of the endpoint as seen by the STUN server.

Click on a STUN Binding Success Response packet. In the packet detail pane (middle section), expand:
```
Session Traversal Utilities for NAT
  → Attributes
    → XOR-MAPPED-ADDRESS
```

The IP in there? That's an external IP associated with one side of the connection. Cross-reference with your WHOIS results.

**Method C — The "volume heuristic":**

P2P call streams are *chatty*. If you see a conversation with thousands of packets and megabytes of data going to a non-Meta IP over a ~60 second call, that's almost certainly your media stream going directly to the peer.

Relay connections will show similar volume but pointed at Facebook ASN IPs.

---

### Step 9: Geolocate (Using Publicly Available Data)

Once you've identified the non-Meta IP, you can look up its approximate geographic location using any public IP geolocation service. These are free, legal, and pull from publicly available RIR (Regional Internet Registry) data.

Some options:

- [ipinfo.io](https://ipinfo.io)  
- [iplocation.net](https://iplocation.net)
- [ipapi.co](https://ipapi.co)  
- [db-ip.com](https://db-ip.com)
- `whois <IP>` from your terminal (gives you ASN, netblock, and registrant info)
- `curl ipinfo.io/<IP>` if you're terminal-brained

**Important reality check:** IP geolocation gives you **city-level accuracy at best**, and even that's wrong half the time. You'll get the city and ISP. You're not getting a street address. This isn't a movie. If you were expecting a red dot on a map with crosshairs, go watch NCIS.

What you *can* infer:
- **Country and approximate region**
- **ISP / mobile carrier** (is this a home connection? a mobile network? a VPN?)
- **Whether they're using a VPN or proxy** (if the IP maps to a data center instead of a residential ISP, they're proxied)

---

### Step 10: Clean Up After Yourself (Good Hygiene)

Once you've finished your *personal network audit*, you should:

1. **Save the capture** if you want it for your own records: `File → Save As` → `.pcapng` format. Store it encrypted (VeraCrypt volume, encrypted ZIP, whatever). This is *your* network data and you have every right to keep it.

2. **Or delete it** if you don't need it. `File → Close` without saving. Gone.

3. Close Wireshark.

4. Go about your day knowing slightly more about what your computer does behind your back.

---

## Common Gotchas & Troubleshooting

**"I only see Meta IPs, no peer IP."**

Welcome to 2026. Meta has been increasingly forcing call traffic through their TURN relays, especially when one or both parties are on cellular data or behind carrier-grade NAT (CGNAT). The desktop client on a clean home network has the best chance of establishing a direct P2P connection. If both parties are on Wi-Fi with semi-decent NAT situations (standard home routers), you've got a shot. If one person is on LTE behind CGNAT in India... probably relay. Tough luck.

**"I see a million packets and can't find anything."**

You didn't close your other apps. Go back to Step 3. Actually do it this time.

**"Wireshark won't capture anything / empty screen."**

- Wrong interface selected. Go back to Step 2.
- Npcap not installed (Windows). Reinstall it.
- Permissions issue (Linux). Did you add yourself to the `wireshark` group? Did you log out and back in?
- Your VPN is wrapping everything. Disconnect your VPN first — you're analyzing your local traffic on your local network.

**"The IP geolocated to a completely different country than where my friend is."**

They might be on a VPN. Or their mobile carrier's gateway is in another city/country. Or the geolocation database is just wrong — they often are. This isn't CSI. It's a best-effort lookup from a free web tool based on RIR data that was last updated whenever some intern at ARIN got around to it.

**"Can I do this on my phone directly?"**

Technically yes, if you're on a rooted Android device with tcpdump or a packet capture app. But it's way more pain than it's worth for this exercise. Use the desktop client. Your phone's network stack is messy and the added noise from background app traffic is a nightmare to filter. Just... use a computer. Please.

---

## Wrapping Up

So there you have it. A complete walkthrough of auditing your own VoIP traffic to identify what IP addresses are connecting to your machine during a WhatsApp call. Everything here uses:

- **Your own device** ✓
- **Your own network** ✓
- **Open-source tools used in every university networking course on earth** ✓
- **Publicly available IP lookup data** ✓

I didn't break into anything. I didn't intercept anyone else's traffic. I looked at packets arriving at *my own network interface* on *my own computer* on *my own Wi-Fi* and Googled the IPs I found. That's it. That's the whole crime. Alert the FBI.

If this taught you something about how VoIP works under the hood, or made you realize how much metadata leaks from a "simple phone call" — good. That's the point. Understanding how your tools work is step one of not getting screwed by them.

Now go audit your own traffic and stop trusting apps that promise "end-to-end encryption" while establishing direct IP connections between peers. The encryption covers the *content*. The IP addresses? Those are just... there. Floating. Like your data. In the wind.

Stay curious. Stay legal. And for the love of god, close your browser tabs before running a capture.

— **Allen**

---

*© 2026 Allen. All content provided for educational and personal network auditing purposes only. The author is not responsible for, and expressly disclaims all liability for, any actions taken by any reader based on information published here. Unauthorized interception of network communications is a federal crime in most jurisdictions. Don't be dumb.*