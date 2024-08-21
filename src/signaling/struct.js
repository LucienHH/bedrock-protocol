const SignalType = {
    ConnectRequest: 'CONNECTREQUEST',
    ConnectResponse: 'CONNECTRESPONSE',
    CandidateAdd: 'CANDIDATEADD',
    ConnectError: 'CONNECTERROR'
}

const ICECandidateType = {
    Relay: 'relay',
    Srflx: 'srflx',
    Host: 'host',
    Prflx: 'prflx'
}

class SignalStructure {

  constructor(type, connectionID, data, networkID) {
    this.type = type
    this.connectionID = connectionID
    this.data = data
    this.networkID = networkID
  }

  marshalText() {
    return this.toString()
  }

  unmarshalText(input) {
    const segments = input.split(' ', 3)
    if (segments.length !== 3) {
      throw new Error(`unexpected segmentations: ${segments.length}`)
    }

    this.type = segments[0]
    this.connectionID = BigInt(segments[1])
    this.data = segments[2]
  }

  toString() {
    return `${this.type} ${this.connectionID.toString()} ${this.data}`
  }

  static fromWSMessage(networkID, message) {
    const segments = message.split(' ', 3)
    if (segments.length !== 3) {
      throw new Error(`unexpected segmentations: ${segments.length}`)
    }

    const [type, connectionId, ...data] = message.split(' ')


    return new SignalStructure(type, BigInt(connectionId), data.join(' '), networkID)
  }
}

function formatICECandidate(id, candidate, iceParams) {

  const parts = []

  parts.push('candidate:' + candidate.foundation)
  parts.push('1') 
  parts.push('udp')
  parts.push(candidate.priority.toString())
  parts.push(candidate.ip)
  parts.push(candidate.port.toString())
  parts.push('typ')
  parts.push(candidate.type)

  if (candidate.type === ICECandidateType.Relay || candidate.type === ICECandidateType.Srflx) {
    if (candidate.relatedAddress) {
      parts.push('raddr')
      parts.push(candidate.relatedAddress)
    }
    if (candidate.relatedPort !== undefined) {
      parts.push('rport')
      parts.push(candidate.relatedPort.toString())
    }
  }

  parts.push('generation')
  parts.push('0')
  parts.push('ufrag')
  parts.push(iceParams.usernameFragment)
  parts.push('network-id')
  parts.push(id.toString())
  parts.push('network-cost')
  parts.push('0')

  return parts.join(' ')
}

module.exports = {
  SignalStructure,
  SignalType,
  formatICECandidate
}