const { getRandomUint64 } = require('../signaling/Signal')

const { RTCPeerConnection, candidateFromSdp } = require('@lucienhh/werift')

const { parse, write } = require('sdp-transform')

const { formatICECandidate, SignalStructure, SignalType } = require('../signaling/struct')

const { Connections } = require('./Connection')

class Nethernet {

  constructor(signaling, networkId = getRandomUint64(), connectionId = getRandomUint64()) {

    this.networkId = networkId

    this.connectionId = connectionId

    this.signaling = signaling

    this.connections = new Map()

    this.onOpenConnection = () => { }
    this.onCloseConnection = () => { }
    this.onEncapsulated = () => { }

  }

  async handleCandidate(signal) {

    const conn = this.connections.get(signal.connectionID)

    if (!conn) {
      throw new Error('Received ICE candidate for unknown connection')
    }

    const ice = conn.webrtc.iceTransports[0]

    if (!ice) {
      throw new Error('Failed to get ICE transport')
    }

    const candidate = candidateFromSdp(signal.data)

    await ice.addRemoteCandidate(candidate)

  }

  async handleOffer(signal) {

    const creds = await this.signaling.getCredentials()

    const conn = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:relay.communication.microsoft.com:3478',
          credential: creds.TurnAuthServers[0].Password,
          username: creds.TurnAuthServers[0].Username,
        },
        {
          urls: 'turn:relay.communication.microsoft.com:3478',
          credential: creds.TurnAuthServers[0].Password,
          username: creds.TurnAuthServers[0].Username,
        },
      ],
    })

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.write(
          new SignalStructure(SignalType.CandidateAdd, signal.connectionID, e.candidate.candidate, signal.networkID)
        )
      }
    }

    await conn.setRemoteDescription({ type: 'offer', sdp: signal.data })

    const c = new Connections(this, signal.connectionID, signal.networkID, conn, parse(signal.data))

    this.connections.set(signal.connectionID, c)

    await conn.createAnswer()

    const ice = conn.iceTransports[0]

    const dtls = conn.dtlsTransports[0]

    const sctp = conn.sctpTransport

    if (!ice || !dtls || !sctp) {
      throw new Error('Failed to create transports')
    }

    const iceParams = ice.iceGather.localParameters

    const dtlsParams = dtls.localParameters

    if (dtlsParams.fingerprints.length == 0) {
      throw new Error('local DTLS parameters has no fingerprints')
    }

    const desc = write({
      version: 0,
      origin: {
        username: '-',
        sessionId: getRandomUint64().toString(),
        sessionVersion: 2,
        netType: 'IN',
        ipVer: 4,
        address: '127.0.0.1',
      },
      name: '-',
      timing: { start: 0, stop: 0 },
      groups: [ { type: 'BUNDLE', mids: '0' } ],
      extmapAllowMixed: 'extmap-allow-mixed',
      msidSemantic: { semantic: '', token: 'WMS' },
      media: [
        {
          rtp: [],
          fmtp: [],
          type: 'application',
          port: 9,
          protocol: 'UDP/DTLS/SCTP',
          payloads: 'webrtc-datachannel',
          connection: { ip: '0.0.0.0', version: 4 },
          iceUfrag: iceParams.usernameFragment,
          icePwd: iceParams.password,
          iceOptions: 'trickle',
          fingerprint: { type: dtlsParams.fingerprints[0].algorithm, hash: dtlsParams.fingerprints[0].value },
          setup: 'active',
          mid: '0',
          sctpPort: 5000,
          maxMessageSize: 65536,
        },
      ],
    })

    await conn.setLocalDescription({ type: 'answer', sdp: desc })

    this.signaling.write(
      new SignalStructure(SignalType.ConnectResponse, signal.connectionID, desc, signal.networkID)
    )

  }

  async listen() {

    await this.signaling.connect()

    this.signaling.on('signal', (signal) => {

      switch (signal.type) {
        case SignalType.ConnectRequest:
          this.handleOffer(signal)
          break
        case SignalType.CandidateAdd:
          this.handleCandidate(signal)
          break
        default:
          console.log('received signal for unknown type', signal)
      }

    })

  }

}

module.exports = { Nethernet }