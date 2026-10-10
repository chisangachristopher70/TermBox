import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeControlFrame,
  decodeCreditFrame,
  decodeDataInputFrame,
  decodeDataOutputFrame,
  decodeFrame,
  decodeMarkFrame,
  encodeControlFrame,
  encodeCreditFrame,
  encodeDataInputFrame,
  encodeDataOutputFrame,
  encodeMarkFrame,
  OutputSequenceTracker,
  TSP_FRAME_HEADER_BYTES,
  TSP_LIMITS,
  TSP_SUBPROTOCOL,
  TspFrameType,
  TspMarkType,
  TspProtocolError
} from '../packages/protocol/tsp.js';

function rawFrame(type, streamId, payload) {
  const bytes = new Uint8Array(TSP_FRAME_HEADER_BYTES + payload.length);
  bytes[0] = type;
  new DataView(bytes.buffer).setUint32(1, streamId, false);
  bytes.set(payload, TSP_FRAME_HEADER_BYTES);
  return bytes;
}

function expectProtocolError(callback, code) {
  assert.throws(callback, (error) => error instanceof TspProtocolError && error.code === code);
}

test('TSP v1 frames use a binary type and big-endian stream ID header', () => {
  assert.equal(TSP_SUBPROTOCOL, 'termbox.tsp.v1');
  const frame = encodeDataInputFrame(0x01020304, Uint8Array.of(0x61));

  assert.deepEqual([...frame.slice(0, TSP_FRAME_HEADER_BYTES)], [
    TspFrameType.DATA, 0x01, 0x02, 0x03, 0x04
  ]);
  assert.deepEqual(decodeDataInputFrame(frame), {
    streamId: 0x01020304,
    bytes: Uint8Array.of(0x61)
  });
});

test('input DATA preserves arbitrary PTY bytes and supports typed-array views', () => {
  const input = Uint8Array.of(0x00, 0x1b, 0x5b, 0x32, 0x4a, 0xff);
  const frame = encodeDataInputFrame(7, input);
  const withOffset = new Uint8Array(frame.length + 2);
  withOffset.set(frame, 1);

  assert.deepEqual(decodeDataInputFrame(withOffset.subarray(1, -1)).bytes, input);
});

test('output DATA carries its first PTY-output byte sequence as uint64 big-endian', () => {
  const data = Uint8Array.of(0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xff);
  const frame = encodeDataOutputFrame(19, '18422', data);
  const decoded = decodeDataOutputFrame(frame);

  assert.equal(decoded.streamId, 19);
  assert.equal(decoded.firstSequence, 18422n);
  assert.deepEqual(decoded.bytes, data);
  assert.equal(new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
    .getBigUint64(TSP_FRAME_HEADER_BYTES, false), 18422n);
});

test('CONTROL frames round-trip UTF-8 JSON and validate sequence-bearing controls', () => {
  const attach = {
    t: 'attach',
    session: 'ses_example',
    ticket: 'one-time-ticket',
    last_seq: '18421',
    term: { cols: 120, rows: 32, name: 'xterm-256color' }
  };
  const decodedAttach = decodeControlFrame(encodeControlFrame(3, attach));
  assert.equal(decodedAttach.streamId, 3);
  assert.deepEqual(decodedAttach.control, attach);

  const ready = { t: 'ready', seq_base: '18422', caps: ['resize', 'signal'] };
  assert.deepEqual(decodeControlFrame(encodeControlFrame(3, ready)).control, ready);

  const resume = { t: 'resume', replayed: 240, gap: false };
  assert.deepEqual(decodeControlFrame(encodeControlFrame(3, resume)).control, resume);
});

test('different session streams can be multiplexed on one WebSocket', () => {
  const frames = [
    encodeDataInputFrame(11, Uint8Array.of(0x61)),
    encodeDataInputFrame(12, Uint8Array.of(0x62))
  ];

  assert.deepEqual(frames.map((frame) => decodeFrame(frame).streamId), [11, 12]);
  assert.deepEqual(
    decodeControlFrame(encodeControlFrame(0, { t: 'ping', ts: 1 })),
    { streamId: 0, control: { t: 'ping', ts: 1 } }
  );
});

test('CREDIT grants are bounded uint32 counts of output bytes', () => {
  const decoded = decodeCreditFrame(encodeCreditFrame(2, TSP_LIMITS.maxCreditBytes));
  assert.deepEqual(decoded, { streamId: 2, creditBytes: TSP_LIMITS.maxCreditBytes });

  expectProtocolError(() => encodeCreditFrame(2, 0), 'INVALID_CREDIT');
  expectProtocolError(() => encodeCreditFrame(2, TSP_LIMITS.maxCreditBytes + 1), 'INVALID_CREDIT');
  expectProtocolError(() => decodeCreditFrame(rawFrame(TspFrameType.CREDIT, 2, Uint8Array.of(0, 0, 0))), 'INVALID_CREDIT');
  expectProtocolError(() => decodeCreditFrame(rawFrame(TspFrameType.CREDIT, 2, Uint8Array.of(0, 0, 0, 0))), 'INVALID_CREDIT');
});

test('MARK frames round-trip replay, gap, and live boundaries', () => {
  for (const markType of Object.values(TspMarkType)) {
    const encoded = encodeMarkFrame(5, markType, TSP_LIMITS.maxSequence);
    assert.deepEqual(decodeMarkFrame(encoded), {
      streamId: 5,
      markType,
      sequence: TSP_LIMITS.maxSequence
    });
  }
});

test('output sequence tracker detects discontinuities and explicit replay gaps', () => {
  const tracker = new OutputSequenceTracker(9, 100n);
  tracker.acceptMark({ streamId: 9, markType: TspMarkType.REPLAY_START, sequence: 100n });
  assert.equal(tracker.acceptData({
    streamId: 9,
    firstSequence: 100n,
    bytes: Uint8Array.of(0x61, 0x62)
  }), 101n);
  assert.equal(tracker.lastSequence, 101n);

  tracker.acceptMark({ streamId: 9, markType: TspMarkType.GAP, sequence: 105n });
  assert.equal(tracker.lastSequence, 104n);
  tracker.acceptMark({ streamId: 9, markType: TspMarkType.LIVE_START, sequence: 105n });
  tracker.acceptData({ streamId: 9, firstSequence: 105n, bytes: Uint8Array.of(0x63) });
  assert.equal(tracker.lastSequence, 105n);

  expectProtocolError(() => tracker.acceptData({
    streamId: 9,
    firstSequence: 107n,
    bytes: Uint8Array.of(0x64)
  }), 'SEQUENCE_GAP');
  expectProtocolError(() => tracker.acceptMark({
    streamId: 10,
    markType: TspMarkType.LIVE_START,
    sequence: 106n
  }), 'INVALID_MARK');
});

test('accepts the documented maximum DATA and CONTROL payload sizes and rejects larger frames', () => {
  const maximumData = new Uint8Array(TSP_LIMITS.maxDataBytes).fill(0x61);
  assert.equal(decodeDataInputFrame(encodeDataInputFrame(1, maximumData)).bytes.length, maximumData.length);
  assert.equal(decodeDataOutputFrame(encodeDataOutputFrame(1, 1n, maximumData)).bytes.length, maximumData.length);

  const controlBase = JSON.stringify({ t: 'x', data: '' }).length;
  const maximumControl = { t: 'x', data: 'a'.repeat(TSP_LIMITS.maxControlBytes - controlBase) };
  assert.equal(decodeControlFrame(encodeControlFrame(1, maximumControl)).control.data.length,
    maximumControl.data.length);
  expectProtocolError(() => encodeControlFrame(1, {
    t: 'x',
    data: 'a'.repeat(TSP_LIMITS.maxControlBytes - controlBase + 1)
  }), 'INVALID_CONTROL');
  expectProtocolError(() => decodeFrame(new Uint8Array(TSP_FRAME_HEADER_BYTES + TSP_LIMITS.maxDataBytes + 9)), 'INVALID_FRAME');
});

test('deterministic DATA round trips preserve arbitrary bytes and sequence values', () => {
  for (let caseIndex = 1; caseIndex <= 100; caseIndex += 1) {
    const byteLength = (caseIndex * 997) % TSP_LIMITS.maxDataBytes + 1;
    const data = new Uint8Array(byteLength);
    for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
      data[byteIndex] = (caseIndex * 31 + byteIndex * 17) & 0xff;
    }

    const firstSequence = BigInt(caseIndex * 100_000);
    const frame = encodeDataOutputFrame(caseIndex, firstSequence, data);
    const decoded = decodeDataOutputFrame(frame);
    assert.equal(decoded.streamId, caseIndex);
    assert.equal(decoded.firstSequence, firstSequence);
    assert.deepEqual(decoded.bytes, data);
  }
});

test('rejects malformed frames, invalid controls, oversized data, and sequence overflow', () => {
  expectProtocolError(() => decodeFrame(Uint8Array.of(1, 0)), 'INVALID_FRAME');
  expectProtocolError(() => decodeFrame(rawFrame(0xff, 1, Uint8Array.of(1))), 'UNKNOWN_FRAME_TYPE');
  expectProtocolError(() => encodeDataInputFrame(0, Uint8Array.of(1)), 'INVALID_STREAM_ID');
  expectProtocolError(() => encodeDataInputFrame(1, new Uint8Array(TSP_LIMITS.maxDataBytes + 1)), 'INVALID_DATA');
  expectProtocolError(() => decodeFrame('not binary'), 'INVALID_BINARY');

  expectProtocolError(() => decodeControlFrame(rawFrame(TspFrameType.CONTROL, 1, Uint8Array.of(0xff))), 'INVALID_CONTROL');
  expectProtocolError(() => decodeControlFrame(rawFrame(TspFrameType.CONTROL, 1, Uint8Array.of(0x7b, 0x7d))), 'INVALID_CONTROL');
  expectProtocolError(() => encodeControlFrame(0, { t: 'attach', last_seq: '0' }), 'INVALID_STREAM_ID');
  expectProtocolError(() => encodeControlFrame(1, { t: 'attach', last_seq: '01' }), 'INVALID_SEQUENCE');
  expectProtocolError(() => encodeControlFrame(1, { t: 'ready', seq_base: '0' }), 'INVALID_SEQUENCE');
  expectProtocolError(() => encodeControlFrame(1, { t: 'resume', replayed: -1, gap: false }), 'INVALID_CONTROL');
  expectProtocolError(() => encodeControlFrame(1, { t: 'resume', replayed: 0, gap: 'false' }), 'INVALID_CONTROL');

  expectProtocolError(() => encodeMarkFrame(1, 0xff, 1), 'INVALID_MARK');
  expectProtocolError(() => encodeMarkFrame(1, TspMarkType.GAP, 0), 'INVALID_SEQUENCE');
  expectProtocolError(() => encodeDataOutputFrame(1, TSP_LIMITS.maxSequence, Uint8Array.of(1, 2)), 'INVALID_SEQUENCE');
});
