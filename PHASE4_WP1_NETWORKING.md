# Phase 4 Work Package 1: Networking Design and Implementation

## Overview
This document details the networking design and implementation for the StoreSync modern-trade platform to support multi-store operations with offline synchronization capabilities.

## Network Architecture

### Topology
```
                    [Internet]
                        |
                [Cloud Server - Primary]
                        |
            -------------------------------
            |               |               |
        [Store 1]       [Store 2]       [Store N]
            |               |               |
        [POS Devices]   [POS Devices]   [POS Devices]
```

### Components

#### 1. Cloud Infrastructure
- **Primary Server**: Hosts the central database and API
- **Database**: PostgreSQL with replication for high availability
- **API Gateway**: Fastify backend with rate limiting
- **CDN**: Static assets and cached responses
- **Load Balancer**: Distributes traffic across instances

#### 2. Store Network
- **Router**: Business-grade router with VPN capability
- **Switch**: Local network for POS devices
- **POS Devices**: Tablets, terminals, handheld scanners
- **Local Server**: Optional local caching server for offline mode

#### 3. VPN Configuration
- **Protocol**: WireGuard (recommended) or OpenVPN
- **Authentication**: Certificate-based
- **Mesh Topology**: Store-to-store and store-to-cloud connectivity
- **Failover**: Automatic reconnection with exponential backoff

## Network Security

### Firewall Rules

#### Cloud Server (Inbound)
| Port | Protocol | Purpose | Source |
|------|----------|---------|--------|
| 443 | TCP | HTTPS API | Any |
| 22 | TCP | SSH (admin only) | VPN IP ranges |
| 5432 | TCP | PostgreSQL (replica only) | VPN IP ranges |

#### Cloud Server (Outbound)
| Port | Protocol | Purpose | Destination |
|------|----------|---------|-------------|
| 443 | TCP | Payment provider APIs | eSewa, Khalti |
| 587 | TCP | Email (SMTP) | SMTP servers |
| 53 | UDP/TCP | DNS | DNS servers |

#### Store Router (Inbound)
| Port | Protocol | Purpose | Source |
|------|----------|---------|--------|
| 51820 | UDP | WireGuard VPN | Cloud server, other stores |
| 443 | TCP | HTTPS (local API) | Local network only |

#### Store Router (Outbound)
| Port | Protocol | Purpose | Destination |
|------|----------|---------|-------------|
| 51820 | UDP | WireGuard VPN | Cloud server |
| 443 | TCP | HTTPS API | Cloud server |
| 53 | UDP/TCP | DNS | DNS servers |

### Network Security Policies

1. **Zero Trust**: All connections require authentication
2. **Encryption**: All traffic over VPN is encrypted
3. **Segmentation**: POS devices on separate VLAN from admin network
4. **Monitoring**: Network traffic logging and anomaly detection
5. **Updates**: Regular firmware updates for routers and firewalls

## Multi-Store Connectivity

### VPN Mesh Configuration

#### WireGuard Configuration Example

**Cloud Server (wg0.conf)**
```ini
[Interface]
PrivateKey = <CLOUD_PRIVATE_KEY>
Address = 10.0.0.1/24
ListenPort = 51820
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Store 1
PublicKey = <STORE1_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32
Endpoint = <STORE1_PUBLIC_IP>:51820
PersistentKeepalive = 25

[Peer]
# Store 2
PublicKey = <STORE2_PUBLIC_KEY>
AllowedIPs = 10.0.0.3/32
Endpoint = <STORE2_PUBLIC_IP>:51820
PersistentKeepalive = 25
```

**Store 1 (wg0.conf)**
```ini
[Interface]
PrivateKey = <STORE1_PRIVATE_KEY>
Address = 10.0.0.2/24
ListenPort = 51820

[Peer]
# Cloud Server
PublicKey = <CLOUD_PUBLIC_KEY>
AllowedIPs = 10.0.0.1/32, 10.0.0.0/24
Endpoint = <CLOUD_PUBLIC_IP>:51820
PersistentKeepalive = 25

[Peer]
# Store 2 (optional direct connection)
PublicKey = <STORE2_PUBLIC_KEY>
AllowedIPs = 10.0.0.3/32
Endpoint = <STORE2_PUBLIC_IP>:51820
PersistentKeepalive = 25
```

### DNS Configuration

- **Internal DNS**: Stores resolve internal services via VPN
- **Split DNS**: External queries go to public DNS
- **Failover**: Local caching DNS server for offline mode

## Device Network Configuration

### POS Device Requirements

1. **Static IP Assignment**: Each POS device has a static IP
2. **NTP Sync**: Time synchronization with cloud server
3. **Proxy Configuration**: HTTP proxy for controlled internet access
4. **Certificate Installation**: CA certificates for HTTPS

### Network Profile Template

```json
{
  "network": {
    "type": "static",
    "ip_address": "192.168.1.100",
    "subnet_mask": "255.255.255.0",
    "gateway": "192.168.1.1",
    "dns_servers": ["192.168.1.1", "8.8.8.8"]
  },
  "vpn": {
    "enabled": true,
    "server": "cloud.storesync.com",
    "port": 51820,
    "protocol": "wireguard"
  },
  "proxy": {
    "enabled": true,
    "http_proxy": "http://192.168.1.1:8080",
    "https_proxy": "http://192.168.1.1:8080",
    "bypass_list": ["*.local", "*.storesync.internal"]
  }
}
```

## Offline Synchronization Network Behavior

### Connection States

1. **Online**: Full connectivity to cloud server
2. **Degraded**: Limited connectivity, sync in progress
3. **Offline**: No connectivity, local mode active

### Sync Strategy

- **Priority**: Critical transactions (sales, payments) first
- **Compression**: Gzip compression for large payloads
- **Batching**: Transactions batched in groups of 100
- **Retry**: Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
- **Conflict Resolution**: Last-write-wins with manual review for conflicts

## Monitoring and Logging

### Network Metrics

- **Latency**: Round-trip time to cloud server
- **Bandwidth**: Upload/download speeds
- **Packet Loss**: Percentage of lost packets
- **VPN Status**: Connection uptime and reconnection events

### Logging

- **Connection Events**: VPN connect/disconnect
- **Sync Events**: Successful/failed sync attempts
- **Security Events**: Failed authentication attempts
- **Performance**: Slow queries and timeouts

## Implementation Checklist

- [ ] Deploy cloud server infrastructure
- [ ] Configure VPN on cloud server
- [ ] Generate and distribute VPN certificates
- [ ] Configure store routers with VPN
- [ ] Set up firewall rules on cloud server
- [ ] Set up firewall rules on store routers
- [ ] Configure internal DNS
- [ ] Set up network monitoring
- [ ] Configure POS device network profiles
- [ ] Test offline synchronization
- [ ] Test failover scenarios
- [ ] Document network topology
- [ ] Train staff on network troubleshooting

## Troubleshooting

### Common Issues

**VPN Connection Fails**
1. Check firewall allows UDP 51820
2. Verify certificates are valid
3. Check router NAT traversal settings
4. Review WireGuard logs

**High Latency**
1. Check internet bandwidth
2. Verify VPN tunnel is stable
3. Check for network congestion
4. Review routing tables

**Sync Failures**
1. Verify API endpoint is reachable
2. Check authentication tokens
3. Review offline sync logs
4. Test with manual sync trigger

## Security Considerations

1. **Certificate Rotation**: Rotate VPN certificates every 90 days
2. **Key Management**: Store private keys securely (HSM recommended)
3. **Access Control**: Limit VPN access to authorized devices
4. **Audit Logging**: Log all network access attempts
5. **Penetration Testing**: Regular security audits

## Disaster Recovery

1. **Backup VPN Configurations**: Store configs in version control
2. **Redundant Cloud**: Multi-region deployment
3. **Emergency Access**: Out-of-band management access
4. **Recovery Plan**: Documented procedures for network failures
