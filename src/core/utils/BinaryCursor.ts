function toUint8Array(
  input: ArrayBuffer | ArrayBufferView | Uint8Array
): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  return new Uint8Array(input);
}

export class BinaryCursor {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(input: ArrayBuffer | ArrayBufferView | Uint8Array) {
    this.bytes = toUint8Array(input);
    this.view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset,
      this.bytes.byteLength
    );
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.length - this.offset;
  }

  seek(position: number): void {
    if (position < 0 || position > this.length) {
      throw new RangeError(
        `Cannot seek to ${position}; valid range is 0..${this.length}.`
      );
    }

    this.offset = position;
  }

  skip(length: number): void {
    this.seek(this.offset + length);
  }

  readUint8(): number {
    this.ensureAvailable(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt32(littleEndian = true): number {
    this.ensureAvailable(4);
    const value = this.view.getInt32(this.offset, littleEndian);
    this.offset += 4;
    return value;
  }

  readFloat64(littleEndian = true): number {
    this.ensureAvailable(8);
    const value = this.view.getFloat64(this.offset, littleEndian);
    this.offset += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    this.ensureAvailable(length);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  peekUint8(): number {
    this.ensureAvailable(1);
    return this.view.getUint8(this.offset);
  }

  private ensureAvailable(length: number): void {
    if (length < 0) {
      throw new RangeError("Length must be non-negative.");
    }

    if (this.offset + length > this.length) {
      throw new RangeError(
        `Cannot read ${length} byte(s) from offset ${this.offset}; only ${this.remaining} byte(s) remain.`
      );
    }
  }
}

