package com.cobrarede.snake

import java.net.Inet4Address
import java.net.NetworkInterface

object NetworkUtils {
    const val GAME_PORT = 47923

    fun localWifiIpv4(): String? {
        val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
        for (iface in interfaces.toList()) {
            if (!iface.isUp || iface.isLoopback) continue
            for (addr in iface.inetAddresses.toList()) {
                if (addr is Inet4Address && !addr.isLoopbackAddress) {
                    val host = addr.hostAddress ?: continue
                    if (host.startsWith("169.254.")) continue
                    return host
                }
            }
        }
        return null
    }
}
