export const TSP_SUBPROTOCOL = 'termbox.tsp.v1';
export const TSP_FRAME_HEADER_BYTES = 5;
export const TSP_OUTPUT_SEQUENCE_BYTES = 8;

export const TspFrameType = Object.freeze({
  DATA: 0x01,
  CONTROL: 0x02,
  CREDIT: 0x03,
  MARK: 0x04
});

export const TspMarkType = Object.freeze({
  REPLAY_START: 0x01,
  GAP: 0x02,
  LIVE_START: 0x03
});

const MAX_UINT32 = 0xffffffff;
const MAX_UINT64 = (1n << 64n) - 1n;
const VALID_FRAME_TYPES = new Set(Object.values(TspFrameType));
const VALID_MARK_TYPES = new Set(Object.values(TspMarkType));
const CONNECTION_CONTROL_TYPES = new Set(['ping', 'pong', 'error']);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const TSP_LIMITS = Object.freeze({
  maxDataBytes: 64 * 1024,
  maxControlBytes: 64 * 1024,
  maxCreditBytes: 512 * 1024,
  maxReplayBytes: 2 * 1024 * 1024,
  maxSequence: MAX_UINT64
});

const MAX_FRAME_BYTES = TSP_FRAME_HEADER_BYTES + TSP_OUTPUT_SEQUENCE_BYTES + TSP_LIMITS.maxDataBytes;

export class TspProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TspProtocolError';
    this.code = code;
  }
}

function protocolError(code, message) {
  return new TspProtocolError(code, message);
}

function asBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw protocolError('INVALID_BINARY', 'TSP frames must be binary data.');
}

function validateStreamId(streamId, { allowConnectionStream = false } = {}) {
  if (!Number.isInteger(streamId) || streamId < 0 || streamId > MAX_UINT32) {
    throw protocolError('INVALID_STREAM_ID', 'TSP stream IDs must be unsigned 32-bit integers.');
  }
  if (streamId === 0 && !allowConnectionStream) {
    throw protocolError('INVALID_STREAM_ID', 'Stream ID 0 is reserved for connection-level control.');
  }
  return streamId;
}

function parseSequence(value, { allowZero = false, field = 'sequence' } = {}) {
  let sequence;

  if (typeof value === 'bigint') {
    sequence = value;
  } else if (typeof value === 'string' && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value)) {
    sequence = BigInt(value);
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
    sequence = BigInt(value);
  } else {
    throw protocolError('INVALID_SEQUENCE', `${field} must be a canonical decimal sequence.`);
  }

  if (sequence < (allowZero ? 0n : 1n) || sequence > MAX_UINT64) {
    throw protocolError('INVALID_SEQUENCE', `${field} is outside the supported sequence range.`);
  }
  return sequence;
}

function parseWireSequence(value, { allowZero = false, field = 'sequence' } = {}) {
  if (typeof value !== 'string') {
    throw protocolError('INVALID_CONTROL', `${field} must be encoded as a decimal string.`);
  }
  return parseSequence(value, { allowZero, field });
}

function validateControlMessage(control) {
  if (!control || typeof control !== 'object' || Array.isArray(control)) {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload must be a JSON object.');
  }
  if (!Object.prototype.hasOwnProperty.call(control, 't') ||
      typeof control.t !== 'string' || control.t.length === 0) {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload must have a non-empty string field "t".');
  }

  if (control.t === 'attach') {
    parseWireSequence(control.last_seq, { allowZero: true, field: 'last_seq' });
  } else if (control.t === 'ready') {
    parseWireSequence(control.seq_base, { field: 'seq_base' });
  } else if (control.t === 'resume') {
    if (!Number.isSafeInteger(control.replayed) ||
        control.replayed < 0 || control.replayed > TSP_LIMITS.maxReplayBytes ||
        typeof control.gap !== 'boolean') {
      throw protocolError('INVALID_CONTROL', 'resume requires a bounded byte count and a boolean gap flag.');
    }
  }

  return control;
}

function decodeControlPayload(payload) {
  if (payload.byteLength === 0 || payload.byteLength > TSP_LIMITS.maxControlBytes) {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload has an invalid size.');
  }

  let control;
  try {
    control = JSON.parse(decoder.decode(payload));
  } catch {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload must be valid UTF-8 JSON.');
  }
  return validateControlMessage(control);
}

function validateControlStream(streamId, control) {
  if (streamId === 0 && !CONNECTION_CONTROL_TYPES.has(control.t)) {
    throw protocolError('INVALID_STREAM_ID', 'Only ping, pong, and error controls may use stream ID 0.');
  }
  if (control.t === 'attach' && streamId === 0) {
    throw protocolError('INVALID_STREAM_ID', 'An attach control must identify a non-zero stream ID.');
  }
}

function encodeRawFrame(type, streamId, payload, { allowConnectionStream = false } = {}) {
  validateStreamId(streamId, { allowConnectionStream });
  const bytes = asBytes(payload);
  const frame = new Uint8Array(TSP_FRAME_HEADER_BYTES + bytes.byteLength);
  frame[0] = type;
  new DataView(frame.buffer).setUint32(1, streamId, false);
  frame.set(bytes, TSP_FRAME_HEADER_BYTES);
  return frame;
}

function decodeRawFrame(message) {
  const bytes = asBytes(message);
  if (bytes.byteLength > MAX_FRAME_BYTES) {
    throw protocolError('INVALID_FRAME', 'TSP frame exceeds the maximum frame size.');
  }
  if (bytes.byteLength < TSP_FRAME_HEADER_BYTES) {
    throw protocolError('INVALID_FRAME', 'TSP frame is shorter than its header.');
  }

  const type = bytes[0];
  if (!VALID_FRAME_TYPES.has(type)) {
    throw protocolError('UNKNOWN_FRAME_TYPE', `Unknown TSP frame type 0x${type.toString(16)}.`);
  }

  const streamId = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, false);
  const payload = bytes.slice(TSP_FRAME_HEADER_BYTES);
  return { type, streamId, payload };
}

export function encodeDataInputFrame(streamId, data) {
  validateStreamId(streamId);
  const bytes = asBytes(data);
  if (bytes.byteLength === 0 || bytes.byteLength > TSP_LIMITS.maxDataBytes) {
    throw protocolError('INVALID_DATA', 'PTY input must contain 1 to 65536 bytes per DATA frame.');
  }
  return encodeRawFrame(TspFrameType.DATA, streamId, bytes);
}

export function decodeDataInputFrame(message) {
  const frame = decodeRawFrame(message);
  if (frame.type !== TspFrameType.DATA) {
    throw protocolError('INVALID_FRAME_TYPE', 'Expected a TSP DATA frame.');
  }
  validateStreamId(frame.streamId);
  if (frame.payload.byteLength === 0 || frame.payload.byteLength > TSP_LIMITS.maxDataBytes) {
    throw protocolError('INVALID_DATA', 'PTY input must contain 1 to 65536 bytes per DATA frame.');
  }
  return { streamId: frame.streamId, bytes: frame.payload };
}

export function encodeDataOutputFrame(streamId, firstSequence, data) {
  validateStreamId(streamId);
  const bytes = asBytes(data);
  if (bytes.byteLength === 0 || bytes.byteLength > TSP_LIMITS.maxDataBytes) {
    throw protocolError('INVALID_DATA', 'PTY output must contain 1 to 65536 bytes per DATA frame.');
  }

  const sequence = parseSequence(firstSequence, { field: 'firstSequence' });
  const lastSequence = sequence + BigInt(bytes.byteLength) - 1n;
  if (lastSequence > MAX_UINT64) {
    throw protocolError('INVALID_SEQUENCE', 'PTY output sequence would overflow uint64.');
  }

  const payload = new Uint8Array(TSP_OUTPUT_SEQUENCE_BYTES + bytes.byteLength);
  new DataView(payload.buffer).setBigUint64(0, sequence, false);
  payload.set(bytes, TSP_OUTPUT_SEQUENCE_BYTES);
  return encodeRawFrame(TspFrameType.DATA, streamId, payload);
}

export function decodeDataOutputFrame(message) {
  const frame = decodeRawFrame(message);
  if (frame.type !== TspFrameType.DATA) {
    throw protocolError('INVALID_FRAME_TYPE', 'Expected a TSP DATA frame.');
  }
  validateStreamId(frame.streamId);
  if (frame.payload.byteLength <= TSP_OUTPUT_SEQUENCE_BYTES ||
      frame.payload.byteLength > TSP_OUTPUT_SEQUENCE_BYTES + TSP_LIMITS.maxDataBytes) {
    throw protocolError('INVALID_DATA', 'PTY output must include a sequence and 1 to 65536 data bytes.');
  }

  const payloadView = new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength);
  const firstSequence = payloadView.getBigUint64(0, false);
  if (firstSequence === 0n) {
    throw protocolError('INVALID_SEQUENCE', 'PTY output sequences start at 1.');
  }
  const bytes = frame.payload.slice(TSP_OUTPUT_SEQUENCE_BYTES);
  const lastSequence = firstSequence + BigInt(bytes.byteLength) - 1n;
  if (lastSequence > MAX_UINT64) {
    throw protocolError('INVALID_SEQUENCE', 'PTY output sequence would overflow uint64.');
  }
  return { streamId: frame.streamId, firstSequence, bytes };
}

export function encodeControlFrame(streamId, control) {
  validateStreamId(streamId, { allowConnectionStream: true });
  validateControlMessage(control);
  validateControlStream(streamId, control);

  let json;
  try {
    json = JSON.stringify(control);
  } catch {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload could not be serialized as JSON.');
  }
  if (typeof json !== 'string') {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload could not be serialized as JSON.');
  }

  const payload = encoder.encode(json);
  if (payload.byteLength === 0 || payload.byteLength > TSP_LIMITS.maxControlBytes) {
    throw protocolError('INVALID_CONTROL', 'TSP CONTROL payload exceeds the 64 KiB limit.');
  }
  return encodeRawFrame(TspFrameType.CONTROL, streamId, payload, { allowConnectionStream: true });
}

export function decodeControlFrame(message) {
  const frame = decodeRawFrame(message);
  if (frame.type !== TspFrameType.CONTROL) {
    throw protocolError('INVALID_FRAME_TYPE', 'Expected a TSP CONTROL frame.');
  }
  validateStreamId(frame.streamId, { allowConnectionStream: true });
  const control = decodeControlPayload(frame.payload);
  validateControlStream(frame.streamId, control);
  return { streamId: frame.streamId, control };
}

export function encodeCreditFrame(streamId, creditBytes) {
  validateStreamId(streamId);
  if (!Number.isInteger(creditBytes) || creditBytes < 1 || creditBytes > TSP_LIMITS.maxCreditBytes) {
    throw protocolError('INVALID_CREDIT', 'A CREDIT grant must be between 1 and 524288 bytes.');
  }
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, creditBytes, false);
  return encodeRawFrame(TspFrameType.CREDIT, streamId, payload);
}

export function decodeCreditFrame(message) {
  const frame = decodeRawFrame(message);
  if (frame.type !== TspFrameType.CREDIT) {
    throw protocolError('INVALID_FRAME_TYPE', 'Expected a TSP CREDIT frame.');
  }
  validateStreamId(frame.streamId);
  if (frame.payload.byteLength !== 4) {
    throw protocolError('INVALID_CREDIT', 'A CREDIT payload must be exactly four bytes.');
  }

  const creditBytes = new DataView(frame.payload.buffer, frame.payload.byteOffset, 4).getUint32(0, false);
  if (creditBytes < 1 || creditBytes > TSP_LIMITS.maxCreditBytes) {
    throw protocolError('INVALID_CREDIT', 'A CREDIT grant must be between 1 and 524288 bytes.');
  }
  return { streamId: frame.streamId, creditBytes };
}

export function encodeMarkFrame(streamId, markType, sequence) {
  validateStreamId(streamId);
  if (!VALID_MARK_TYPES.has(markType)) {
    throw protocolError('INVALID_MARK', 'Unknown TSP MARK type.');
  }
  const seq = parseSequence(sequence, { field: 'MARK sequence' });
  const payload = new Uint8Array(9);
  payload[0] = markType;
  new DataView(payload.buffer).setBigUint64(1, seq, false);
  return encodeRawFrame(TspFrameType.MARK, streamId, payload);
}

export function decodeMarkFrame(message) {
  const frame = decodeRawFrame(message);
  if (frame.type !== TspFrameType.MARK) {
    throw protocolError('INVALID_FRAME_TYPE', 'Expected a TSP MARK frame.');
  }
  validateStreamId(frame.streamId);
  if (frame.payload.byteLength !== 9 || !VALID_MARK_TYPES.has(frame.payload[0])) {
    throw protocolError('INVALID_MARK', 'A MARK payload must contain a known marker and uint64 sequence.');
  }

  const sequence = new DataView(frame.payload.buffer, frame.payload.byteOffset, 9).getBigUint64(1, false);
  if (sequence === 0n) {
    throw protocolError('INVALID_MARK', 'MARK sequences start at 1.');
  }
  return { streamId: frame.streamId, markType: frame.payload[0], sequence };
}

export function decodeFrame(message) {
  const frame = decodeRawFrame(message);
  switch (frame.type) {
    case TspFrameType.DATA:
      validateStreamId(frame.streamId);
      if (frame.payload.byteLength === 0 ||
          frame.payload.byteLength > TSP_OUTPUT_SEQUENCE_BYTES + TSP_LIMITS.maxDataBytes) {
        throw protocolError('INVALID_DATA', 'TSP DATA payload has an invalid size.');
      }
      break;
    case TspFrameType.CONTROL: {
      validateStreamId(frame.streamId, { allowConnectionStream: true });
      frame.control = decodeControlPayload(frame.payload);
      validateControlStream(frame.streamId, frame.control);
      break;
    }
    case TspFrameType.CREDIT: {
      validateStreamId(frame.streamId);
      if (frame.payload.byteLength !== 4) {
        throw protocolError('INVALID_CREDIT', 'A CREDIT payload must be exactly four bytes.');
      }
      frame.creditBytes = new DataView(frame.payload.buffer, frame.payload.byteOffset, 4).getUint32(0, false);
      if (frame.creditBytes < 1 || frame.creditBytes > TSP_LIMITS.maxCreditBytes) {
        throw protocolError('INVALID_CREDIT', 'A CREDIT grant must be between 1 and 524288 bytes.');
      }
      break;
    }
    case TspFrameType.MARK: {
      validateStreamId(frame.streamId);
      if (frame.payload.byteLength !== 9 || !VALID_MARK_TYPES.has(frame.payload[0])) {
        throw protocolError('INVALID_MARK', 'A MARK payload must contain a known marker and uint64 sequence.');
      }
      frame.markType = frame.payload[0];
      frame.sequence = new DataView(frame.payload.buffer, frame.payload.byteOffset, 9).getBigUint64(1, false);
      if (frame.sequence === 0n) {
        throw protocolError('INVALID_MARK', 'MARK sequences start at 1.');
      }
      break;
    }
    default:
      throw protocolError('UNKNOWN_FRAME_TYPE', 'Unknown TSP frame type.');
  }
  return frame;
}

export class OutputSequenceTracker {
  constructor(streamId, sequenceBase) {
    this.streamId = validateStreamId(streamId);
    this.nextSequence = parseSequence(sequenceBase, { field: 'seq_base' });
  }

  get lastSequence() {
    return this.nextSequence - 1n;
  }

  acceptMark(mark) {
    if (!mark || mark.streamId !== this.streamId || !VALID_MARK_TYPES.has(mark.markType)) {
      throw protocolError('INVALID_MARK', 'MARK does not belong to this output stream.');
    }
    const sequence = parseSequence(mark.sequence, { field: 'MARK sequence' });

    if (mark.markType === TspMarkType.GAP) {
      if (sequence <= this.nextSequence) {
        throw protocolError('SEQUENCE_GAP', 'A GAP marker must advance to a later retained sequence.');
      }
      this.nextSequence = sequence;
      return;
    }
    if (sequence !== this.nextSequence) {
      throw protocolError('SEQUENCE_GAP', 'Replay and live markers must match the next expected sequence.');
    }
  }

  acceptData(dataFrame) {
    if (!dataFrame || dataFrame.streamId !== this.streamId) {
      throw protocolError('INVALID_STREAM_ID', 'DATA does not belong to this output stream.');
    }
    const firstSequence = parseSequence(dataFrame.firstSequence, { field: 'firstSequence' });
    const bytes = asBytes(dataFrame.bytes);
    if (bytes.byteLength === 0 || bytes.byteLength > TSP_LIMITS.maxDataBytes) {
      throw protocolError('INVALID_DATA', 'PTY output must contain 1 to 65536 bytes per DATA frame.');
    }
    if (firstSequence !== this.nextSequence) {
      throw protocolError('SEQUENCE_GAP', 'PTY output DATA is not contiguous with the expected sequence.');
    }

    const lastSequence = firstSequence + BigInt(bytes.byteLength) - 1n;
    if (lastSequence > MAX_UINT64) {
      throw protocolError('INVALID_SEQUENCE', 'PTY output sequence would overflow uint64.');
    }
    this.nextSequence = lastSequence + 1n;
    return lastSequence;
  }
}
