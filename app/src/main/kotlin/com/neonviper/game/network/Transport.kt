package com.neonviper.game.network

import java.io.Closeable
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException

interface GameClock {
    val now: Long
    fun listen(listener: () -> Unit) = Unit
}

class SystemGameClock : GameClock {
    override val now: Long get() = System.currentTimeMillis()
}

class ManualClock(start: Long = 0L) : GameClock {
    private var current = start
    private val listeners = mutableListOf<() -> Unit>()
    override val now: Long get() = current

    override fun listen(listener: () -> Unit) {
        listeners += listener
    }

    fun advanceBy(millis: Long) {
        current += millis
        listeners.toList().forEach { it() }
    }
}

data class ReceivedDatagram(val from: InetSocketAddress, val bytes: ByteArray)

interface DatagramTransport : Closeable {
    fun send(target: InetSocketAddress, bytes: ByteArray)
    fun receive(timeoutMillis: Int): ReceivedDatagram?
}

class UdpTransport(port: Int = DISCOVERY_PORT) : DatagramTransport {
    private val socket = DatagramSocket(null).apply {
        reuseAddress = true
        broadcast = true
        bind(InetSocketAddress(port))
    }

    override fun send(target: InetSocketAddress, bytes: ByteArray) {
        socket.send(DatagramPacket(bytes, bytes.size, target))
    }

    override fun receive(timeoutMillis: Int): ReceivedDatagram? {
        socket.soTimeout = timeoutMillis.coerceAtLeast(1)
        val buffer = ByteArray(Protocol.MAX_PACKET_SIZE)
        val packet = DatagramPacket(buffer, buffer.size)
        return try {
            socket.receive(packet)
            val from = packet.socketAddress as? InetSocketAddress ?: return null
            ReceivedDatagram(from, packet.data.copyOf(packet.length))
        } catch (_: SocketTimeoutException) {
            null
        }
    }

    override fun close() {
        socket.close()
    }

    companion object {
        const val DISCOVERY_PORT = 28777

        fun broadcastTargets(): List<InetSocketAddress> {
            val targets = linkedSetOf(InetSocketAddress("255.255.255.255", DISCOVERY_PORT))
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return targets.toList()
            interfaces.asSequence().forEach { iface ->
                iface.interfaceAddresses.forEach { address ->
                    address.broadcast?.let { targets += InetSocketAddress(it, DISCOVERY_PORT) }
                }
            }
            return targets.toList()
        }
    }
}
