# Terminal Stream Protocol v1 — wire contract (draft)

**Status:** Proposed wire contract. A JavaScript codec and unit tests are in this repository; there is not yet a Gateway or a second implementation to prove interoperability.

This document makes the frame and replay details needed by the browser and Gateway explicit. It complements [ADR 0002](../adr/0002-terminal-stream-protocol.md); it does not claim that a terminal runtime or remote service exists.

## 1. Transport and frame boundary

- Use one TLS WebSocket with negotiated subprotocol `termbox.tsp.v1`.
- Each **binary WebSocket message is exactly one TSP frame**. WebSocket supplies the message length and reassembles fragmented messages; TSP has no additional length prefix. Browser clients set `WebSocket.binaryType = 'arraybuffer'`; the codec accepts `ArrayBuffer`/typed-array data and rejects text/Blob values.
- A TSP frame begins with a five-byte header:

  | Offset | Size | Field | Encoding |
  | --- | ---: | --- | --- |
  | 0 | 1 byte | `type` | unsigned byte |
  | 1 | 4 bytes | `stream_id` | unsigned 32-bit, big-endian |
  | 5 | remaining | `payload` | defined by frame type below |

- Stream IDs are allocated by the client, are non-zero, and MUST NOT be reused while that WebSocket is open. `stream_id = 0` is reserved for connection-level `CONTROL` messages (`ping`, `pong`, or `error`). A session attach and every session-scoped frame use that session's non-zero stream ID. This allows multiple sessions to share one WebSocket.
- Text WebSocket messages, unknown frame types, invalid payloads, and invalid stream/type combinations are protocol errors. A receiver MUST NOT try to resynchronize by scanning bytes.

Constants in the codec: maximum PTY data per frame is 65,536 bytes; maximum UTF-8 control JSON is 65,536 bytes; one CREDIT grant is at most 524,288 bytes; the replay ring is bounded to 2 MiB and 60 seconds as described in the architecture.

## 2. Frame types

### `0x01` DATA

The DATA payload is direction-specific:

- **Browser → Gateway (PTY input):** raw PTY input bytes, 1–65,536 bytes. Client input is not replayed or automatically retransmitted after reconnect; a client must not resend uncertain input because it could execute a command twice.
- **Gateway → browser (PTY output):** an 8-byte unsigned big-endian `first_sequence`, followed by 1–65,536 raw PTY output bytes. `first_sequence` is the sequence number of the first PTY output byte in that frame. The sequence for each following byte increments by one. Sequences are per session stream, begin at `1`, and MUST be contiguous except where a `GAP` marker explicitly advances the expected sequence.

The output sequence header is protocol metadata; it is not written into xterm. Credit counts only PTY bytes, not the 8-byte sequence or TSP header. Output sequence values range from `1` to `2^64 - 1`; the Gateway must end or rotate a session before wrap and must never reuse a sequence.

### `0x02` CONTROL

The payload is a non-empty UTF-8 JSON object with a non-empty string field `t`. Maximum encoded payload is 64 KiB. Invalid UTF-8, malformed JSON, a JSON array/scalar, or a missing/invalid `t` is an error. Sequence values in JSON are canonical unsigned decimal **strings** so JavaScript cannot round them:

- `attach.last_seq` is the greatest output sequence the client has consumed; use `"0"` before any output.
- `ready.seq_base` is the client's requested next output sequence (`last_seq + 1`), before any retention gap is applied. A `GAP` marker advances the receiver to the first retained sequence.
- `resume.replayed` is a number of PTY output **bytes**, not frames, and is bounded by the 2 MiB replay ring.

Core controls already present in the architecture include:

```jsonc
// Browser -> Gateway, on a client-allocated non-zero stream_id
{"t":"attach","session":"ses_…","ticket":"tkt_…","last_seq":"18421",
 "term":{"cols":120,"rows":32,"name":"xterm-256color"}}
{"t":"resize","cols":132,"rows":43}
{"t":"signal","name":"SIGINT"}
{"t":"ping","ts":1770000000000}
{"t":"detach"}

// Gateway -> browser, on the attached stream_id
{"t":"ready","seq_base":"18422","runtime":"firecracker",
 "image":"kali/2026.1-core@sha256:…","caps":["record","resize","signal","suspend"]}
{"t":"resume","replayed":240,"gap":false}
{"t":"warn","code":"IDLE_SUSPEND","in_ms":60000}
{"t":"exit","code":0,"signal":null}

// Either direction, on stream_id 0 for connection-level health/errors
{"t":"pong","ts":1770000000000}
```

The `attach` ticket remains a one-time, short-lived authorization credential. TSP framing does not authenticate it; the Gateway must validate ticket, origin, session ownership, and expiry before attaching.

### `0x03` CREDIT

The payload is exactly one unsigned 32-bit big-endian integer from `1` to `524,288`. A CREDIT frame grants that many bytes of **Gateway → browser PTY output** for its `stream_id`; protocol/header bytes do not consume credit. The browser grants more credit only as output is consumed. The Gateway MUST cap total unspent credit and unconsumed output at 512 KiB per stream, stop reading/throttle the PTY when exhausted, and never use CREDIT as permission to buffer without limit. Credit accounting is session-scoped even though the WebSocket is shared.

### `0x04` MARK

The payload is exactly nine bytes: one marker byte followed by a non-zero unsigned 64-bit big-endian sequence boundary.

| Marker | Value | Sequence meaning |
| --- | ---: | --- |
| `REPLAY_START` | `0x01` | First output sequence in a contiguous replay; must equal the next expected sequence. |
| `GAP` | `0x02` | First retained output sequence after older output fell outside replay retention; advances the expected sequence and must be greater than it. |
| `LIVE_START` | `0x03` | First sequence of live output after replay; must equal the next expected sequence. |

A client reports a gap visibly; it MUST NOT silently treat trimmed output as complete.

## 3. Attach, replay, and resume ordering

1. The client sends `CONTROL attach` with its stream ID and `last_seq`.
2. The Gateway authenticates the ticket, checks that the session is attachable, and rejects a `last_seq` beyond the session's current output watermark.
3. The Gateway sends `CONTROL ready`. `seq_base` is always `last_seq + 1`, the byte the client requested next. This remains true when output has been trimmed; a later `MARK GAP` advances the receiver to the first retained sequence.
4. The Gateway sends `MARK REPLAY_START` before contiguous replay, or `MARK GAP` before replay when output has been trimmed. Replay DATA is sent in sequence and consumes the client's credit.
5. After all available replay bytes have been delivered, the Gateway sends `CONTROL resume` with the replayed byte count and gap flag, then `MARK LIVE_START` with the next output sequence. With no replay and no gap, `resume` has `replayed: 0, gap: false` and `LIVE_START` uses `last_seq + 1`.
6. Live DATA continues from `LIVE_START`. On browser receive, each DATA `first_sequence` must equal the next expected sequence; the browser advances its in-memory `last_seq` only after xterm confirms the bytes were consumed. It sends replacement CREDIT after consumption. Clients process frames serially per stream, waiting for each xterm write callback before applying later markers/controls or granting credit. A reconnecting client must drain its already-received xterm writes before sending `attach`, so output awaiting a write callback is neither duplicated nor skipped.

The Gateway retains output by byte sequence in a bounded per-session ring (2 MiB and 60 seconds, whichever limit is reached first). If the requested next byte is no longer retained, it reports `gap: true` and marks the first retained sequence explicitly. The client must not claim a gap-free resume in that case.

## 4. Limits, errors, and security requirements

- A DATA frame carries at most 64 KiB of PTY bytes; a CONTROL payload carries at most 64 KiB. Receivers reject oversize messages before buffering or parsing their contents.
- The Gateway MUST bound its client-input queue as well as output buffering. It MUST fail/close an overloaded stream visibly rather than create an unbounded queue.
- A protocol error is explicit (`TspProtocolError` in the browser codec); the Gateway should return a stream-scoped error where possible, otherwise close the connection with a protocol error. It must not silently drop malformed frames or unknown required controls.
- The Gateway must enforce WSS, origin policy, one-time ticket validation, session authorization, per-stream quotas, timeouts, and independent stream isolation. Possession of a stream ID is not authorization.
- PTY output remains untrusted terminal data. The codec preserves bytes; the terminal renderer and its OSC/clipboard/link policy remain responsible for safe handling.

## 5. Implementation status and conformance

`packages/protocol/tsp.js` implements the frame codec, field/size checks, credit and marker validation, and an output sequence tracker. `tests/tsp.test.js` covers byte round trips, malformed frames, bounds, multiplexing, and sequence gaps. These are **unit/conformance tests for one implementation only**.

Not implemented or verified here: WebSocket upgrade/auth, a Go Gateway, replay-ring storage, PTY/runtime adapters, recording, reconnect behavior, load testing, or browser-to-Go interoperability. Before the Gateway ships, its implementation must pass the same vectors plus fuzz/property tests, reconnect drills, and the Q1/Q6 latency/recovery measurements in `docs/ARCHITECTURE.md`.
