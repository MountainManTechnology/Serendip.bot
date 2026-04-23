"""URL safety checks — prevents SSRF attacks by blocking private/internal IPs."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from agent.logging import log

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    # IPv6 private/special ranges
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def is_safe_url(url: str) -> bool:
    """Check if a URL is safe to fetch — blocks private IPs, non-HTTP schemes, etc."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    # Only allow http and https
    if parsed.scheme not in ("http", "https"):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    # Block common dangerous hostnames
    if hostname in ("metadata.google.internal", "metadata.google.internal."):
        return False

    # Resolve DNS and check every A/AAAA record
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        log.debug("dns_resolve_failed", hostname=hostname)
        return False

    if not infos:
        return False

    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False

        if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            log.warning("ssrf_blocked_ip", url=url, ip=str(ip), reason="ip_property")
            return False

        for net in _BLOCKED_NETWORKS:
            if ip in net:
                log.warning("ssrf_blocked_ip", url=url, ip=str(ip), network=str(net))
                return False

    return True
