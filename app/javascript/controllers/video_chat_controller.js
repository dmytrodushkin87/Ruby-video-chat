import { Controller } from 'stimulus'
import consumer from 'channels/consumer'

export default class extends Controller {
  static targets = ['local_video', 'remote_videos']

  connect() {
    this.currentUser = this.data.get("session")
    this.pcPeers = {}
    this.ice = {
      "iceServers": [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    }
    this.JOIN_ROOM = "JOIN_ROOM"
    this.EXCHANGE = "EXCHANGE"
    this.REMOVE_USER = "REMOVE_USER"
    this.stream().then(stream => {
      this._stream = stream
      this.local_videoTarget.srcObject = stream
    }).then(() => {
      this.subscription()
    })
  }

  disconnect() {
    this._subscription.unsubscribe()
    this._subscription.disconnected()
    this.stream().getTracks().forEach( function (track) {
      track.stop()
    })
  }

  subscription() {
    if (this._subscription === undefined) {
      let _this = this
      this._subscription = consumer.subscriptions.create(
        { channel: 'RoomChannel', id: _this.data.get("id") },
        {
          connected() {
            this.send({ type: _this.JOIN_ROOM, from: _this.currentUser})
          },
          disconnected() {
            this.send({ type: _this.REMOVE_USER, from: _this.currentUser})
          },
          received(data) {
            if (data.from === _this.currentUser) return
            switch (data.type) {
              case _this.JOIN_ROOM:
                return _this.joinRoom(data)
              case _this.EXCHANGE:
                return _this.exchange(data)
              case _this.REMOVE_USER:
                return _this.removeUser(data)
              default:
                return
            }
          }
        }
      )
    }
  }

  async stream() {
    if (this._stream === undefined) {
      if (navigator.mediaDevices.getUserMedia) {
        return navigator.mediaDevices.getUserMedia({audio: false, video: true})
      }
    }
    return this._stream
  }

  joinRoom(data) {
    this.createPC(data.from, true)
  }

  createPC(userId, isOffer) {
    let pc = new RTCPeerConnection(this.ice)
    this.pcPeers[userId] = pc
    let _this = this

    for (const track of _this._stream.getTracks()) {
      pc.addTrack(track, _this._stream)
    }

    isOffer && pc
      .createOffer()
      .then((offer) => {
        return pc.setLocalDescription(offer)
      })
      .then(() => {
        _this._subscription.send({
          type: _this.EXCHANGE,
          from: _this.currentUser,
          to: userId,
          sdp: JSON.stringify(pc.localDescription)
        })
      })

    pc.onicecandidate = (event) => {
      event.candidate &&
      _this._subscription.send({
        type: _this.EXCHANGE,
        from: _this.currentUser,
        to: userId,
        candidate: JSON.stringify(event.candidate)
      })
    }

    pc.ontrack = (event) => {
      if (document.getElementById(`video-${userId}`)) return
      const element = document.createElement('video')
      element.id = userId
      element.autoplay = true
      element.playsInline = true
      element.srcObject = event.streams[0]
      _this.remote_videosTarget.append(element)
    }

    return pc

  }

  exchange(data) {
    let pc
    if (!this.pcPeers[data.from]) {
      pc = this.createPC(data.from, false)
    } else {
      pc = this.pcPeers[data.from]
    }

    if (data.candidate) {
      pc.addIceCandidate(new RTCIceCandidate(JSON.parse(data.candidate)))
    }

    if (data.sdp) {
      const sdp = JSON.parse(data.sdp)
      let _this = this
      pc.setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => {
          if (sdp.type == 'offer') {
            pc.createAnswer()
              .then((answer) => {
                return pc.setLocalDescription(answer)
              })
              .then(() => {
                _this._subscription.send({
                  type: _this.EXCHANGE,
                  from: _this.currentUser,
                  to: data.from,
                  sdp: JSON.stringify(pc.localDescription)
                })
              })
          }
        })
    }
  }

  removeUser(data) {
    document.getElementById(`video-${data.from}`).remove()
    delete this.pcPeers[data.from]
  }

}
