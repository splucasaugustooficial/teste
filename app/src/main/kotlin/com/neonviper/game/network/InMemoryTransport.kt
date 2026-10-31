package com.neonviper.game.network

import java.net.InetSocketAddress

class InMemoryTransport {
    private val endpoints = linkedMapOf<String, MemoryEndpoint>()

    fun endpoint(id: String): MemoryEndpoint = endpoints.getOrPut(id) {
        MemoryEndpoint(id, InetSocketAddress("10.0.0.${endpoints.size + 1}", UdpTransport.DISCOVERY_PORT))
    }

    fun flush() {
        repeat(8) {
            val batch = endpoints.values.flatMap { source ->
                val pending = source.outgoing.toList()
                source.outgoing.clear()
                pending.map { source to it }
            }
            if (batch.isEmpty()) return
            batch.forEach { (source, pending) ->
                recipients(source, pending.target).forEach { destination ->
                    destination.incoming.add(ReceivedDatagram(source.address, pending.bytes))
                }
            }
            endpoints.values.forEach { it.listener?.invoke() }
        }
    }

    private fun recipients(source: MemoryEndpoint, target: InetSocketAddress): List<MemoryEndpoint> {
        val others = endpoints.values.filter { it.id != source.id }
        if (target.hostString == "255.255.255.255") return others
        return others.filter { it.address.port == target.port && it.address.hostString == target.hostString }
    }
}

class MemoryEndpoint(
    val id: String,
    val address: InetSocketAddress,
) : DatagramTransport {
    internal val outgoing = ArrayDeque<Pending>()
    internal val incoming = ArrayDeque<ReceivedDatagram>()
    var listener: (() -> Unit)? = null

    override fun send(target: InetSocketAddress, bytes: ByteArray) {
        outgoing.add(Pending(target, bytes.copyOf()))
    }

    override fun receive(timeoutMillis: Int): ReceivedDatagram? = if (incoming.isEmpty()) null else incoming.removeFirst()

    override fun close() {
        outgoing.clear()
        incoming.clear()
    }
}

data class Pending(val target: InetSocketAddress, val bytes: ByteArray)
