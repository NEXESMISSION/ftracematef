/**
 * Live Preview — peer-to-peer camera streaming between two devices on the
 * same account.
 *
 * Architecture:
 *  - WebRTC carries the video stream directly between the two devices. No
 *    media ever touches our servers, so there's no bandwidth cost.
 *  - Supabase Realtime broadcast channel is the *signaling* layer: SDP
 *    offer/answer + ICE candidates are tiny JSON messages, pennies at most.
 *  - Channel name is `${kind}:${userId}`. The user UUID is unguessable, so
 *    only the user's own devices (or an admin who already pulled the user
 *    list from the secure admin endpoint) can find it.
 *  - Two `kind`s are in use:
 *      'live'       — user's own /live page (phone ↔ desktop pairing).
 *      'tracewatch' — admin spectating a /trace session. Same protocol,
 *                     separate channel so it never fights the user's own
 *                     device pairing.
 *  - Presence is used to discover the other side: each peer tracks itself
 *    with a `role` field, and the broadcaster automatically initiates the
 *    offer when it sees a viewer appear (and vice versa for cleanup).
 *
 * Limitations:
 *  - 1:1 only per channel. With separate `kind`s, /live and /trace can
 *    coexist; within one kind, a second viewer is ignored.
 *  - STUN-only. ~80% of consumer NATs work; symmetric NATs (some corporate
 *    networks) need TURN. Add a TURN server later if reports come in.
 */
import { supabase } from './supabase.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Default `kind` keeps the existing /live page working without changes.
// Pass kind: 'tracewatch' to use the admin-spectator channel.
const channelName = (userId, kind = 'live') => `${kind}:${userId}`;

/**
 * Resolve the caller's pairing token for /live (lazy-create on first call).
 * Returns a uuid the caller passes in as the channel-key for both
 * startBroadcaster and startViewer, so the realtime channel becomes
 * `live:{token}` instead of `live:{userId}`. The user's UUID can leak
 * through error logs / analytics / shared screenshots; the token can't —
 * it's only ever in the realtime channel name itself.
 *
 * Both devices belonging to the same user fetch the same token (the RPC
 * looks it up by auth.uid()), so they meet on the same channel without
 * any out-of-band coordination.
 */
export async function getLivePairingKey() {
  const { data, error } = await supabase.rpc('get_live_pairing_token');
  if (error) throw new Error(error.message || 'pairing token fetch failed');
  if (typeof data !== 'string' || data.length !== 36) {
    throw new Error('pairing token: unexpected response shape');
  }
  return data;
}
const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// ────────────────────────────────────────────────────────────────────────────
// Broadcaster: owns the camera stream, sends offers when a viewer appears.
// onQualityRequest: optional callback fired when the viewer requests a
// quality preset — the broadcaster's UI uses it to resize the canvas etc.
// referenceImageDataUrl: optional thumbnail data URL. When provided, an
// "extras" data channel is opened and the image is sent as soon as the
// channel is ready — admin spectator uses this to show what the user is
// tracing alongside the live camera feed.
// ────────────────────────────────────────────────────────────────────────────
export function startBroadcaster({
  userId,
  kind = 'live',
  stream,
  referenceImageDataUrl = null,
  onStatus,
  onError,
  onQualityRequest,
}) {
  const myId = newId();
  let pc = null;
  let videoSender = null;
  let metaChannel = null;
  let viewerId = null;
  let pendingIce = [];
  let stopped = false;

  const channel = supabase.channel(channelName(userId, kind), {
    config: {
      broadcast: { self: false },
      presence: { key: myId },
    },
  });

  const send = (type, extra = {}) => {
    if (stopped) return;
    channel.send({
      type: 'broadcast',
      event: 'live',
      payload: { type, fromId: myId, role: 'broadcaster', ...extra },
    });
  };

  const teardownPC = () => {
    if (metaChannel) { try { metaChannel.close(); } catch { /* ignore */ } metaChannel = null; }
    if (pc) { try { pc.close(); } catch { /* ignore */ } pc = null; }
    pendingIce = [];
  };

  const initiateOffer = async () => {
    teardownPC();
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    videoSender = null;

    // Open the data channel BEFORE addTrack/createOffer so it's negotiated
    // in the SDP. The channel carries the reference-image thumbnail (and
    // any future side-band metadata) — message type 'r' keeps the wire
    // format short. We send the thumbnail once on open; if the viewer
    // reconnects, a fresh PC + channel is created here and the thumbnail
    // is re-sent automatically.
    try {
      metaChannel = pc.createDataChannel('meta', { ordered: true });
      metaChannel.onopen = () => {
        if (stopped || !metaChannel) return;
        if (referenceImageDataUrl) {
          try {
            metaChannel.send(JSON.stringify({
              type: 'r',
              dataUrl: referenceImageDataUrl,
            }));
          } catch (err) {
            console.warn('[livePreview] failed to send reference image:', err);
          }
        }
      };
      metaChannel.onerror = (err) => {
        // Non-fatal — the video stream is the load-bearing payload.
        console.warn('[livePreview] data channel error:', err);
      };
    } catch (err) {
      console.warn('[livePreview] could not create data channel:', err);
    }

    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === 'video') videoSender = sender;
    });
    pc.onicecandidate = (e) => {
      if (e.candidate && viewerId) send('ice', { candidate: e.candidate, to: viewerId });
    };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      const s = pc.connectionState;
      if (s === 'connected') onStatus?.('connected');
      else if (s === 'failed') {
        onStatus?.('disconnected');
        teardownPC();
        viewerId = null;
      } else if (s === 'disconnected') {
        onStatus?.('reconnecting');
      }
    };

    onStatus?.('connecting');
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send('offer', { sdp: offer, to: viewerId });
    } catch (err) {
      onError?.(err?.message ?? 'Failed to start the connection.');
    }
  };

  channel.on('presence', { event: 'sync' }, () => {
    if (stopped) return;
    const state = channel.presenceState();
    let foundViewer = null;
    for (const key of Object.keys(state)) {
      const meta = state[key]?.[0];
      if (meta?.role === 'viewer') { foundViewer = key; break; }
    }
    if (foundViewer && foundViewer !== viewerId) {
      viewerId = foundViewer;
      initiateOffer();
    } else if (!foundViewer && viewerId) {
      viewerId = null;
      teardownPC();
      onStatus?.('waiting');
    }
  });

  channel.on('broadcast', { event: 'live' }, async ({ payload }) => {
    if (stopped || !payload || payload.fromId === myId) return;
    if (payload.role !== 'viewer') return;
    if (payload.to && payload.to !== myId) return;

    // Quality requests don't need an active peer connection — the viewer
    // can send their preference before the offer is even out.
    if (payload.type === 'quality' && payload.preset) {
      try { onQualityRequest?.(payload.preset); } catch { /* ignore */ }
      return;
    }

    if (!pc) return;

    try {
      if (payload.type === 'answer') {
        await pc.setRemoteDescription(payload.sdp);
        // ICE that arrived before remoteDescription was set must be replayed now.
        while (pendingIce.length) {
          try { await pc.addIceCandidate(pendingIce.shift()); } catch { /* ignore */ }
        }
      } else if (payload.type === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          pendingIce.push(payload.candidate);
        }
      }
    } catch (err) {
      console.warn('[livePreview] broadcaster handler error:', err);
    }
  });

  channel.subscribe(async (status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({ role: 'broadcaster' });
        onStatus?.('waiting');
      } catch {
        onError?.('Could not announce this device.');
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onError?.('Signaling channel disconnected. Try again.');
    }
  });

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { channel.untrack(); } catch { /* ignore */ }
      teardownPC();
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    },
    // Apply WebRTC sender encoding parameters. maxBitrate is the most
    // useful knob — it directly controls perceived quality on a fast
    // connection. maxFramerate is honored by some browsers (Chrome) but
    // not others (Safari may ignore).
    setEncoding: async ({ maxBitrate, maxFramerate } = {}) => {
      if (!videoSender) return;
      try {
        const params = videoSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        if (maxBitrate != null)   params.encodings[0].maxBitrate   = maxBitrate;
        if (maxFramerate != null) params.encodings[0].maxFramerate = maxFramerate;
        await videoSender.setParameters(params);
      } catch (err) {
        console.warn('[livePreview] setParameters failed:', err);
      }
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Viewer: receive-only side. Waits for an offer, answers it.
// onReferenceImage: optional callback fired when the broadcaster ships the
// reference-image thumbnail over the "extras" data channel. Receives a
// data URL string suitable for an <img src=...>.
// ────────────────────────────────────────────────────────────────────────────
export function startViewer({ userId, kind = 'live', onStream, onStatus, onError, onReferenceImage }) {
  const myId = newId();
  let broadcasterId = null;
  let pendingIce = [];
  let stopped = false;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  // Tell the PC we expect to receive media. Without these transceivers some
  // browsers won't emit ontrack on remote-only sessions.
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => {
    if (e.streams?.[0]) onStream?.(e.streams[0]);
  };
  // Receive the broadcaster's metadata data channel. We don't open one
  // ourselves — the broadcaster creates it before the offer, and this
  // handler fires once on the viewer side when it negotiates in.
  pc.ondatachannel = (e) => {
    if (e.channel?.label !== 'meta') return;
    e.channel.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data?.type === 'r' && typeof data.dataUrl === 'string') {
          onReferenceImage?.(data.dataUrl);
        }
      } catch (err) {
        console.warn('[livePreview] bad data channel message:', err);
      }
    };
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') onStatus?.('connected');
    else if (s === 'disconnected') onStatus?.('reconnecting');
    else if (s === 'failed') onStatus?.('disconnected');
  };

  const channel = supabase.channel(channelName(userId, kind), {
    config: {
      broadcast: { self: false },
      presence: { key: myId },
    },
  });

  pc.onicecandidate = (e) => {
    if (e.candidate && broadcasterId) {
      channel.send({
        type: 'broadcast',
        event: 'live',
        payload: { type: 'ice', fromId: myId, role: 'viewer', candidate: e.candidate, to: broadcasterId },
      });
    }
  };

  channel.on('presence', { event: 'sync' }, () => {
    if (stopped) return;
    const state = channel.presenceState();
    let foundBroadcaster = null;
    for (const key of Object.keys(state)) {
      const meta = state[key]?.[0];
      if (meta?.role === 'broadcaster') { foundBroadcaster = key; break; }
    }
    if (foundBroadcaster && foundBroadcaster !== broadcasterId) {
      broadcasterId = foundBroadcaster;
      onStatus?.('connecting');
    } else if (!foundBroadcaster && broadcasterId) {
      broadcasterId = null;
      onStatus?.('waiting');
    }
  });

  channel.on('broadcast', { event: 'live' }, async ({ payload }) => {
    if (stopped || !payload || payload.fromId === myId) return;
    if (payload.role !== 'broadcaster') return;
    if (payload.to && payload.to !== myId) return;

    try {
      if (payload.type === 'offer') {
        await pc.setRemoteDescription(payload.sdp);
        while (pendingIce.length) {
          try { await pc.addIceCandidate(pendingIce.shift()); } catch { /* ignore */ }
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: 'broadcast',
          event: 'live',
          payload: { type: 'answer', fromId: myId, role: 'viewer', sdp: answer, to: payload.fromId },
        });
      } else if (payload.type === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate);
        } else {
          pendingIce.push(payload.candidate);
        }
      }
    } catch (err) {
      console.warn('[livePreview] viewer handler error:', err);
    }
  });

  channel.subscribe(async (status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({ role: 'viewer' });
        onStatus?.('waiting');
      } catch {
        onError?.('Could not announce this device.');
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onError?.('Signaling channel disconnected. Try again.');
    }
  });

  const send = (payload) => {
    if (stopped) return;
    channel.send({ type: 'broadcast', event: 'live', payload });
  };

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try { channel.untrack(); } catch { /* ignore */ }
      try { pc.close(); } catch { /* ignore */ }
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    },
    // Tell the broadcaster which quality preset we want. They apply it
    // (canvas resolution + sender bitrate). Safe to call before the
    // connection is up — broadcaster handles it whenever it arrives.
    requestQuality: (preset) => {
      send({
        type: 'quality',
        preset,
        fromId: myId,
        role: 'viewer',
        to: broadcasterId,
      });
    },
  };
}
